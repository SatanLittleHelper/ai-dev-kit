import { doneStage } from '../src/done.mts'
import type { PrLookup } from '../src/pr.mts'
import { exitCode, renderJson, renderText } from '../src/format.mts'
import { getStatus, skipStage, startTask } from '../src/flow.mts'
import { nextPackage } from '../src/next.mts'
import type { JiraTransition } from '../src/jira-transition.mts'
import { validateDraft } from '../src/validate.mts'
import { defaultRunners } from '../src/runners.mts'
import type { Runners } from '../src/runners.mts'
import { submitDraft } from '../src/submit.mts'
import { waitForDecision } from '../src/wait.mts'
import { blocked } from '../src/responses.mts'
import { repositoryRoot } from '../src/root.mts'
import type { FlowResponse } from '../src/types.mts'
import { parseArgs } from './args.mts'
import type { ParsedArgs } from './args.mts'

export interface Io {
  cwd: string
  prLookup?: PrLookup
  now?(): Date
  out(text: string): void
  runners?: Runners
  jiraTransition?: JiraTransition
  sleep?(ms: number): void
}

const COMMANDS = ['start', 'status', 'skip', 'next', 'validate', 'submit', 'wait', 'done']

function execute(args: ParsedArgs, io: Io, now: Date): FlowResponse {
  const { cwd } = io
  if (args.error) return blocked(args.error)
if (args.confirmJira && args.command !== 'next') return blocked('Флаг --confirm-jira поддерживается только командой next.')
  if (args.noDryRun && args.command !== 'next' && args.command !== 'done') return blocked('Флаг --no-dry-run поддерживается только командами next и done.')
  if (args.confirmJira && !args.task) return blocked('Для --confirm-jira укажите явный ключ через --task.')

  const maxPositional = args.command === 'start' || args.command === 'skip' || args.command === 'done' ? 1 : 0
  if (args.positional.length > maxPositional) return blocked(`Лишний аргумент «${args.positional[maxPositional]}».`)

  if (!args.command || !COMMANDS.includes(args.command)) return blocked(`Неизвестная команда «${args.command ?? ''}». Доступны: ${COMMANDS.join(', ')}.`)

  const timeoutMs = Number(args.timeout ?? 30) * 60_000
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || args.timeout?.trim() === '') return blocked('--timeout — неотрицательное число минут.')

  const root = repositoryRoot(cwd)
  if (root === null) return blocked('Не git-репозиторий: запустите команду внутри репозитория.')

  const [first] = args.positional
  if (args.command === 'start') return startTask({ root, id: first, noTracker: args.noTracker, stepDir: args.stepDir })
  if (args.command === 'skip') return skipStage({ root, id: args.task, stage: first ?? '', reason: args.reason })
  if (args.command === 'next') return nextPackage({
    root, id: args.task, now, jiraTransition: io.jiraTransition, confirmJira: args.confirmJira, noDryRun: args.noDryRun, method: args.method, agent: args.agent,
  })
  if (args.command === 'validate') return validateDraft({ root, id: args.task, draft: args.draft, cwd })

  if (args.command === 'done') return doneStage({ root, cwd, id: args.task, stage: first ?? '', evidence: args.evidence, prLookup: io.prLookup, jiraTransition: io.jiraTransition, noDryRun: args.noDryRun })

  if (args.command === 'submit') return submitDraft({ root, cwd, id: args.task, draft: args.draft, runners: io.runners ?? defaultRunners, now })
  if (args.command === 'wait') return waitForDecision({ root, id: args.task, timeoutMs: timeoutMs, sleep: io.sleep })

  return getStatus({ root, id: args.task })
}

export function run(argv: string[], io: Io): number {
  const args = parseArgs(argv)
  const response = execute(args, io, io.now?.() ?? new Date())
  io.out(args.text ? renderText(response) : renderJson(response))

  return exitCode(response)
}
