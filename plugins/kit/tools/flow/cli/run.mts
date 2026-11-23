import { exitCode, renderJson, renderText } from '../src/format.mts'
import { getStatus, skipStage, startTask } from '../src/flow.mts'
import { nextPackage } from '../src/next.mts'
import { validateDraft } from '../src/validate.mts'
import { blocked } from '../src/responses.mts'
import { repositoryRoot } from '../src/root.mts'
import type { FlowResponse } from '../src/types.mts'
import { parseArgs } from './args.mts'
import type { ParsedArgs } from './args.mts'

export interface Io {
  cwd: string
  now?(): Date
  out(text: string): void
}

const COMMANDS = ['start', 'status', 'skip', 'next', 'validate']

function execute(args: ParsedArgs, cwd: string, now: Date): FlowResponse {
  if (!args.command || !COMMANDS.includes(args.command)) return blocked(`Неизвестная команда «${args.command ?? ''}». Доступны: ${COMMANDS.join(', ')}.`)

  const root = repositoryRoot(cwd)
  if (root === null) return blocked('Не git-репозиторий: запустите команду внутри репозитория.')

  const [first] = args.positional
  if (args.command === 'start') return startTask({ root, id: first, noTracker: args.noTracker, stepDir: args.stepDir })
  if (args.command === 'skip') return skipStage({ root, id: args.task, stage: first ?? '', reason: args.reason })
  if (args.command === 'next') return nextPackage({ root, id: args.task, now })
  if (args.command === 'validate') return validateDraft({ root, id: args.task, draft: args.draft })

  return getStatus({ root, id: args.task })
}

export function run(argv: string[], io: Io): number {
  const args = parseArgs(argv)
  const response = execute(args, io.cwd, io.now?.() ?? new Date())
  io.out(args.text ? renderText(response) : renderJson(response))

  return exitCode(response)
}
