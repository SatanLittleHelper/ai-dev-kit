import { CliError, EXIT } from '../src/errors.mts'

export const USAGE = `Использование:
  login
  status
  create --title-file <файл> --body-file <файл> [--type <тип>] [--project <код>] [--assignee me|<логин>] [--parent <KEY-N>] [--sprint <имя>] [--dry-run | --no-dry-run]
  transition <ключ> [--to in-progress|review] [--dry-run | --no-dry-run]
Настройки — .claude/dev-conventions.json в текущем каталоге: jira.baseUrl, jira.defaultIssueType, jira.dryRun, ticketPrefix.
--dry-run открывает видимое окно и проверяет операцию без сохранения.
jira.dryRun: true включает пробный запуск по умолчанию. Флаг --no-dry-run включает реальную операцию.`

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

export const TRANSITION_TARGETS = ['in-progress', 'review'] as const
export type TransitionTarget = (typeof TRANSITION_TARGETS)[number]

export function parseTransitionArgs(argv: string[]): { key: string; dryRun?: boolean; target: TransitionTarget } {
  const [key, ...flags] = argv
  if (!key || !/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) throw usageError('Укажите ключ задачи Jira вида ABC-123.')
  const switches = new Set<string>()
  let target: TransitionTarget = 'in-progress'
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
    if (!SWITCH_FLAGS.includes(name)) throw usageError(`неизвестный флаг ${flag}`)
    switches.add(name)
  }
  return { key, dryRun: dryRunFlag(switches), target }
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
