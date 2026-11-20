import { CliError, EXIT } from '../src/errors.mts'

export const USAGE = `Использование:
  login
  status
  create --title-file <файл> --body-file <файл> [--type <тип>] [--project <код>] [--assignee me|<логин>] [--parent <KEY-N>] [--sprint <имя>] [--dry-run]
Настройки — .claude/dev-conventions.json в текущем каталоге: jira.baseUrl, jira.defaultIssueType, ticketPrefix.
--dry-run заполняет форму в видимом окне, но не нажимает Create и ничего не сохраняет.`

interface CreateArgs {
  title: string
  body: string
  dryRun: boolean
  project?: string
  type?: string
  assignee?: string
  parent?: string
  sprint?: string
}

const VALUE_FLAGS = ['title-file', 'body-file', 'type', 'project', 'assignee', 'parent', 'sprint']
const SWITCH_FLAGS = ['dry-run']

export const usageError = (message: string): CliError => new CliError(`${message}\n${USAGE}`, EXIT.FAILURE)

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
  const titlePath = flags['title-file']
  const bodyPath = flags['body-file']
  if (!titlePath) throw usageError('нужен --title-file')
  if (!bodyPath) throw usageError('нужен --body-file')
  const title = readInput(titlePath, readFile).trim()
  if (!title) throw usageError(`файл названия ${titlePath} пуст`)
  return {
    title,
    body: readInput(bodyPath, readFile).trimEnd(),
    dryRun: switches.has('dry-run'),
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
