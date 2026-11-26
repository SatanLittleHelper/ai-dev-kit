import { guard, GUARD_EVENTS } from '../src/guard.mts'
import type { GuardEvent } from '../src/guard.mts'
import { doneStage } from '../src/done.mts'
import type { PrLookup } from '../src/pr.mts'
import { exitCode, renderJson, renderText } from '../src/format.mts'
import { getStatus, skipStage, startTask } from '../src/flow.mts'
import { syncDrift } from '../src/drift.mts'
import { restartStage } from '../src/restart.mts'
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

const COMMANDS = ['start', 'status', 'skip', 'sync', 'restart', 'next', 'validate', 'submit', 'wait', 'done', 'guard']

// Команды, принимающие один позиционный аргумент: ключ, стадия или событие.
const POSITIONAL_COMMANDS = ['start', 'skip', 'restart', 'done', 'guard']

function execute(args: ParsedArgs, io: Io, now: Date): FlowResponse {
  const { cwd } = io
  if (args.error) return blocked(args.error)
if (args.confirmJira && args.command !== 'next') return blocked('Флаг --confirm-jira поддерживается только командой next.')
  if (args.noDryRun && args.command !== 'next' && args.command !== 'done') return blocked('Флаг --no-dry-run поддерживается только командами next и done.')
  if (args.confirmJira && !args.task) return blocked('Для --confirm-jira укажите явный ключ через --task.')

  const maxPositional = POSITIONAL_COMMANDS.includes(args.command ?? '') ? 1 : 0
  if (args.positional.length > maxPositional) return blocked(`Лишний аргумент «${args.positional[maxPositional]}».`)

  if (!args.command || !COMMANDS.includes(args.command)) return blocked(`Неизвестная команда «${args.command ?? ''}». Доступны: ${COMMANDS.join(', ')}.`)

  const timeoutMs = Number(args.timeout ?? 30) * 60_000
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || args.timeout?.trim() === '') return blocked('--timeout — неотрицательное число минут.')

  const root = repositoryRoot(cwd)
  if (root === null) return blocked('Не git-репозиторий: запустите команду внутри репозитория.')

  const [first] = args.positional
  switch (args.command) {
    case 'start': return startTask({ root, id: first, noTracker: args.noTracker, stepDir: args.stepDir })
    case 'skip': return skipStage({ root, id: args.task, stage: first ?? '', reason: args.reason })
    case 'sync': return syncDrift({ root, id: args.task })
    case 'restart': return restartStage({ root, id: args.task, stage: first ?? '', reason: args.reason, now })
    case 'next': return nextPackage({
      root, id: args.task, now, jiraTransition: io.jiraTransition, confirmJira: args.confirmJira, noDryRun: args.noDryRun, method: args.method, agent: args.agent,
    })
    case 'validate': return validateDraft({ root, id: args.task, draft: args.draft, cwd })
    case 'done': return doneStage({ root, cwd, id: args.task, stage: first ?? '', evidence: args.evidence, prLookup: io.prLookup, jiraTransition: io.jiraTransition, noDryRun: args.noDryRun })
    case 'guard':
      if (!first || !(GUARD_EVENTS as readonly string[]).includes(first)) return blocked(`Укажите событие: ${GUARD_EVENTS.join(', ')}.`)
      return guard({ root, event: first as GuardEvent, branch: args.branch, stopActive: args.stopActive })
    case 'submit': return submitDraft({ root, cwd, id: args.task, draft: args.draft, runners: io.runners ?? defaultRunners, now })
    case 'wait': return waitForDecision({ root, id: args.task, timeoutMs, sleep: io.sleep })
    default: return getStatus({ root, id: args.task })
  }
}

export function run(argv: string[], io: Io): number {
  const args = parseArgs(argv)
  const response = execute(args, io, io.now?.() ?? new Date())
  io.out(args.text ? renderText(response) : renderJson(response))

  return exitCode(response)
}
