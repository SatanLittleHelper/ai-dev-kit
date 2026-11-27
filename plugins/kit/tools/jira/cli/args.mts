import { CliError, EXIT } from '../src/errors.mts'
import { isIssueKey } from '../src/issue-key.mts'

export const USAGE = `Использование:
  login
  status
  create --title-file <файл> --body-file <файл> [--type <тип>] [--project <код>] [--assignee me|<логин>] [--parent <KEY-N>] [--sprint <имя>] [--dry-run | --no-dry-run]
  transition <ключ> [--to in-progress|review|testing] [--assignee <email>] [--dry-run | --no-dry-run]
  after-merge --head-ref <ветка> [--title <заголовок PR>] [--tester-email <email>] [--no-assignee] [--dry-run | --no-dry-run]
  get <ключ> [--with-description]
  comment <ключ> --body-file <файл> [--dry-run | --no-dry-run]
  edit <ключ> [--title-file <файл>] [--body-file <файл>] [--dry-run | --no-dry-run]
  draft split <черновик.md> [--out-dir <каталог>]
  create-roadmap <tickets.md> [--state <roadmap-state.json>] [--resolve <id>=<KEY>|<id>=retry]... [--dry-run | --no-dry-run]
  draft lint <файл> [--kind issue|markup|tickets] [--state <roadmap-state.json>]
Настройки — .claude/dev-conventions.json в текущем каталоге: jira.baseUrl, jira.defaultIssueType, jira.dryRun, ticketPrefix.
--dry-run открывает видимое окно и проверяет операцию без сохранения.
jira.dryRun: true включает пробный запуск по умолчанию. Флаг --no-dry-run включает реальную операцию.
Команды draft работают только с файлами: к Jira не обращаются, настройки не читают.`

interface CreateArgs {
  title: string
  body: string
  dryRun: boolean | undefined
  project?: string
  type?: string
  assignee?: string
  parent?: string
  sprint?: string
}

const VALUE_FLAGS = ['title-file', 'body-file', 'type', 'project', 'assignee', 'parent', 'sprint']
const SWITCH_FLAGS = ['dry-run', 'no-dry-run']

export const usageError = (message: string): CliError => new CliError(`${message}\n${USAGE}`, EXIT.FAILURE)

function dryRunFlag(switches: ReadonlySet<string>): boolean | undefined {
  if (switches.has('dry-run') && switches.has('no-dry-run')) throw usageError('--dry-run и --no-dry-run нельзя использовать вместе')
  if (switches.has('dry-run')) return true
  if (switches.has('no-dry-run')) return false
}

export const TRANSITION_TARGETS = ['in-progress', 'review', 'testing'] as const
export type TransitionTarget = (typeof TRANSITION_TARGETS)[number]

const EMAIL = /^[^\s@]+@[^\s@]+$/

function requireIssueKey(key: string | undefined): string {
  if (!key || !isIssueKey(key)) throw usageError('Укажите ключ задачи Jira вида ABC-123.')
  return key
}

function requireEmail(value: string | undefined, flag: string): string {
  if (!value || !EMAIL.test(value)) throw usageError(`${flag} принимает email, например petrov@example.com`)
  return value
}

export function parseTransitionArgs(argv: string[]): { key: string; dryRun?: boolean; target: TransitionTarget; assignee?: string } {
  const [key, ...flags] = argv
  const issueKey = requireIssueKey(key)
  const switches = new Set<string>()
  let target: TransitionTarget = 'in-progress'
  let assignee: string | undefined
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index]
    if (!flag.startsWith('--')) throw usageError(`лишний аргумент «${flag}»`)
    const name = flag.slice(2)
    if (name === 'to') {
      const value = flags[++index]
      if (!TRANSITION_TARGETS.includes(value as TransitionTarget)) throw usageError(`--to принимает: ${TRANSITION_TARGETS.join(', ')}`)
      target = value as TransitionTarget
      continue
    }
    if (name === 'assignee') {
      assignee = requireEmail(flags[++index], '--assignee')
      continue
    }
    if (!SWITCH_FLAGS.includes(name)) throw usageError(`неизвестный флаг ${flag}`)
    switches.add(name)
  }
  return { key: issueKey, dryRun: dryRunFlag(switches), target, ...(assignee ? { assignee } : {}) }
}

export function parseCreateArgs(argv: string[], readFile: (path: string) => string): CreateArgs {
  const flags: Record<string, string> = {}
  const switches = new Set<string>()
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (!arg.startsWith('--')) throw usageError(`лишний аргумент «${arg}»`)
    const name = arg.slice(2)
    if (SWITCH_FLAGS.includes(name)) {
      switches.add(name)
      continue
    }
    if (!VALUE_FLAGS.includes(name)) throw usageError(`неизвестный флаг --${name}`)
    const value = argv[++index]
    if (value === undefined) throw usageError(`у флага --${name} нет значения`)
    flags[name] = value
  }
  const dryRun = dryRunFlag(switches)
  const titlePath = flags['title-file']
  const bodyPath = flags['body-file']
  if (!titlePath) throw usageError('нужен --title-file')
  if (!bodyPath) throw usageError('нужен --body-file')
  const title = readInput(titlePath, readFile).trim()
  if (!title) throw usageError(`файл названия ${titlePath} пуст`)
  return {
    title,
    body: readInput(bodyPath, readFile).trimEnd(),
    dryRun,
    project: flags.project,
    type: flags.type,
    assignee: flags.assignee,
    parent: flags.parent,
    sprint: flags.sprint,
  }
}

function readInput(path: string, readFile: (path: string) => string): string {
  try {
    return readFile(path)
  } catch {
    throw usageError(`не удалось прочитать файл ${path}`)
  }
}

export function parseAfterMergeArgs(argv: string[]): { headRef: string; title: string; testerEmail?: string; noAssignee: boolean; dryRun?: boolean } {
  const values: Record<string, string> = {}
  const switches = new Set<string>()
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (!flag.startsWith('--')) throw usageError(`лишний аргумент «${flag}»`)
    const name = flag.slice(2)
    if (['head-ref', 'title', 'tester-email'].includes(name)) {
      const value = argv[++index]
      if (value === undefined) throw usageError(`у флага ${flag} нет значения`)
      values[name] = value
      continue
    }
    if (![...SWITCH_FLAGS, 'no-assignee'].includes(name)) throw usageError(`неизвестный флаг ${flag}`)
    switches.add(name)
  }
  if (!values['head-ref']) throw usageError('нужен --head-ref')
  const testerEmail = values['tester-email']
  if (testerEmail !== undefined) requireEmail(testerEmail, '--tester-email')
  if (testerEmail !== undefined && switches.has('no-assignee')) throw usageError('--tester-email и --no-assignee нельзя использовать вместе')
  return {
    headRef: values['head-ref'],
    title: values.title ?? '',
    ...(testerEmail ? { testerEmail } : {}),
    noAssignee: switches.has('no-assignee'),
    dryRun: dryRunFlag(switches),
  }
}

export function parseGetArgs(argv: string[]): { key: string; withDescription: boolean } {
  const [key, ...rest] = argv
  const issueKey = requireIssueKey(key)
  const extra = rest.filter(arg => arg !== '--with-description')
  if (extra.length > 0) throw usageError(`лишний аргумент «${extra[0]}»`)
  return { key: issueKey, withDescription: rest.includes('--with-description') }
}

export type DraftArgs =
  | { action: 'split'; file: string; outDir?: string }
  | { action: 'lint'; file: string; kind: 'issue' | 'markup' | 'tickets'; state?: string }

export function parseDraftArgs(argv: string[]): DraftArgs {
  const [action, file, ...flags] = argv
  if (action !== 'split' && action !== 'lint') throw usageError('draft принимает split или lint.')
  if (!file || file.startsWith('--')) throw usageError('Укажите файл черновика.')
  let outDir: string | undefined
  let kind: 'issue' | 'markup' | 'tickets' = 'issue'
  let state: string | undefined
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index]
    if (action === 'split' && flag === '--out-dir') {
      outDir = flags[++index]
      if (!outDir) throw usageError('у флага --out-dir нет значения')
    } else if (action === 'lint' && flag === '--kind') {
      const value = flags[++index]
      if (value !== 'issue' && value !== 'markup' && value !== 'tickets') throw usageError('--kind принимает: issue, markup, tickets')
      kind = value
    } else if (action === 'lint' && flag === '--state') {
      state = flags[++index]
      if (!state) throw usageError('у флага --state нет значения')
    } else {
      throw usageError(`неизвестный аргумент «${flag}»`)
    }
  }
  if (state && kind !== 'tickets') throw usageError('--state нужен только для --kind tickets')
  return action === 'split' ? { action, file, ...(outDir ? { outDir } : {}) } : { action, file, kind, ...(state ? { state } : {}) }
}

// Разбор флагов вида «--имя значение» и общих переключателей пробного запуска для команд над существующей задачей.
function collectFlags(flags: string[], valueNames: readonly string[]): { values: Record<string, string>; dryRun: boolean | undefined } {
  const values: Record<string, string> = {}
  const switches = new Set<string>()
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index]
    if (!flag.startsWith('--')) throw usageError(`лишний аргумент «${flag}»`)
    const name = flag.slice(2)
    if (SWITCH_FLAGS.includes(name)) {
      switches.add(name)
      continue
    }
    if (!valueNames.includes(name)) throw usageError(`неизвестный флаг ${flag}`)
    const value = flags[++index]
    if (value === undefined) throw usageError(`у флага ${flag} нет значения`)
    values[name] = value
  }
  return { values, dryRun: dryRunFlag(switches) }
}

export function parseCommentArgs(argv: string[], readFile: (path: string) => string): { key: string; body: string; dryRun: boolean | undefined } {
  const [key, ...flags] = argv
  const issueKey = requireIssueKey(key)
  const { values, dryRun } = collectFlags(flags, ['body-file'])
  const path = values['body-file']
  if (!path) throw usageError('нужен --body-file')
  const body = readInput(path, readFile).trimEnd()
  if (!body.trim()) throw usageError(`файл комментария ${path} пуст`)
  return { key: issueKey, body, dryRun }
}

export function parseEditArgs(argv: string[], readFile: (path: string) => string): { key: string; title?: string; body?: string; dryRun: boolean | undefined } {
  const [key, ...flags] = argv
  const issueKey = requireIssueKey(key)
  const { values, dryRun } = collectFlags(flags, ['title-file', 'body-file'])
  const titlePath = values['title-file']
  const bodyPath = values['body-file']
  if (!titlePath && !bodyPath) throw usageError('нужен --title-file или --body-file')
  let title: string | undefined
  let body: string | undefined
  if (titlePath) {
    title = readInput(titlePath, readFile).trim()
    if (!title) throw usageError(`файл названия ${titlePath} пуст`)
  }
  if (bodyPath) {
    body = readInput(bodyPath, readFile).trimEnd()
    if (!body.trim()) throw usageError(`файл описания ${bodyPath} пуст`)
  }
  return { key: issueKey, title, body, dryRun }
}

export function parseCreateRoadmapArgs(argv: string[]): { file: string; dryRun: boolean | undefined; resolves: string[]; state?: string } {
  const [file, ...flags] = argv
  if (!file || file.startsWith('--')) throw usageError('Укажите файл документа тикетов.')
  const resolves: string[] = []
  let state: string | undefined
  const switches = new Set<string>()
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index]
    if (flag === '--resolve' || flag === '--state') {
      const value = flags[++index]
      if (value === undefined) throw usageError(`у флага ${flag} нет значения`)
      if (flag === '--resolve') resolves.push(value)
      else state = value
    } else if (flag.startsWith('--') && SWITCH_FLAGS.includes(flag.slice(2))) {
      switches.add(flag.slice(2))
    } else {
      throw usageError(`неизвестный аргумент «${flag}»`)
    }
  }
  return { file, dryRun: dryRunFlag(switches), resolves, ...(state ? { state } : {}) }
}
