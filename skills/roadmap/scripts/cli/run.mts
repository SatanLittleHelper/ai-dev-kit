import { resolveConfig, TOKEN_ENV } from '../src/config.mts'
import type { Config } from '../src/config.mts'
import { groupRows, intakeItems, loadPr, pullRows } from '../src/status.mts'
import { PublishUnknownError } from '../src/types.mts'
import type { ForgeProvider } from '../src/types.mts'
import { CliError, parseDraft, parseReplies } from './draft.mts'

const USAGE_CODE = 2
const UNKNOWN_STATUS_CODE = 3
const FAILURE_CODE = 1
const VALUE_FLAGS: readonly string[] = ['file', 'host', 'owner', 'repo', 'state']
const BOOLEAN_FLAGS: readonly string[] = ['confirm']
const USAGE = `Использование:
  whoami
  pr list [--state open|closed]
  pr files <N>
  pr get <N> | pr reviews <N> | pr threads <N> | pr feedback <N>
  pr dashboard
  pr review <N> --file draft.json [--confirm]
  pr reply <N> --file replies.json [--confirm]
Репозиторий — из git remote origin или флагов --host --owner --repo. Токен — переменная FORGEJO_TOKEN или GITEA_TOKEN.`

export interface Io {
  env(name: string): string | undefined
  remoteUrl(): string
  readFile(path: string): string
  out(text: string): void
  err(text: string): void
  createProvider(config: Config): ForgeProvider
}

interface Args {
  positional: string[]
  flags: Record<string, string | true>
}

function usageError(message: string): CliError {
  return new CliError(`${message}\n${USAGE}`, USAGE_CODE)
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    if (BOOLEAN_FLAGS.includes(name)) flags[name] = true
    else if (VALUE_FLAGS.includes(name)) {
      const value = argv[++index]
      if (value === undefined) throw usageError(`у флага --${name} нет значения`)
      flags[name] = value
    } else throw usageError(`неизвестный флаг --${name}`)
  }
  return { positional, flags }
}

function numberArg(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) throw usageError('нужен номер PR')
  return Number(value)
}

function fileArg(args: Args, io: Io): string {
  const path = args.flags.file
  if (typeof path !== 'string') throw usageError('нужен --file')
  try {
    return io.readFile(path)
  } catch {
    throw new CliError(`не удалось прочитать файл ${path}`, USAGE_CODE)
  }
}

function print(io: Io, value: unknown): void {
  io.out(JSON.stringify(value, null, 2))
}

function repoFlags(args: Args): { host?: string; owner?: string; repo?: string } {
  const text = (name: string) => (typeof args.flags[name] === 'string' ? args.flags[name] as string : undefined)
  return { host: text('host'), owner: text('owner'), repo: text('repo') }
}

async function execute(argv: string[], io: Io): Promise<void> {
  const args = parseArgs(argv)
  const [group, command, target] = args.positional
  const confirm = args.flags.confirm === true

  const isWhoami = group === 'whoami'
  const known = ['list', 'get', 'files', 'reviews', 'threads', 'feedback', 'dashboard', 'review', 'reply']
  if (!isWhoami && !(group === 'pr' && known.includes(command))) throw usageError('неизвестная команда')
  const number = ['list', 'dashboard'].includes(command) || isWhoami ? 0 : numberArg(target)
  const draft = command === 'review' ? parseDraft(fileArg(args, io)) : undefined
  const replies = command === 'reply' ? parseReplies(fileArg(args, io)) : undefined

  const config = resolveConfig({ flags: repoFlags(args), env: name => io.env(name), remoteUrl: io.remoteUrl() })
  const provider = io.createProvider(config)

  if (isWhoami) return print(io, { login: await provider.currentUser() })
  if (command === 'list') return print(io, await provider.listPulls(args.flags.state === 'closed' ? 'closed' : 'open'))
  if (command === 'get') return print(io, { ...(await provider.getPull(number)), pullRef: provider.pullRef(number) })
  if (command === 'files') return print(io, await provider.listPullFiles(number))
  if (command === 'reviews') return print(io, await provider.listReviews(number))
  if (command === 'threads') return print(io, await provider.listThreads(number))
  if (command === 'feedback') return print(io, intakeItems(await loadPr(provider, number)))
  if (command === 'dashboard') {
    const { rows, truncated } = await pullRows(provider)
    return print(io, { ...groupRows(rows), truncated })
  }
  if (!confirm) return print(io, { dryRun: true, action: command, pull: number, payload: draft ?? replies })
  if (draft) return print(io, { published: true, ...(await provider.publishReview(number, draft)) })
  await provider.publishReplies(number, replies ?? [])
  return print(io, { published: true, count: replies?.length ?? 0 })
}

function exitCodeOf(error: unknown): number {
  if (error instanceof CliError) return error.code
  return error instanceof PublishUnknownError ? UNKNOWN_STATUS_CODE : FAILURE_CODE
}

export async function run(argv: string[], io: Io): Promise<number> {
  try {
    await execute(argv, io)
    return 0
  } catch (error) {
    const secrets = TOKEN_ENV.map(name => io.env(name)?.trim()).filter((value): value is string => Boolean(value))
    io.err(secrets.reduce((text, secret) => text.split(secret).join('***'), (error as Error).message))
    return exitCodeOf(error)
  }
}
