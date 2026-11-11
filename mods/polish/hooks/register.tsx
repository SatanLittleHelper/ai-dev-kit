import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'

// Comma-joined ids of the agents that existed when the chain started: only newer ones count as ours.
// Id of the running main-loop turn, '' between turns: what Cancel aborts, and what advance waits out.
// Set once the wait for the assistant to start on the findings is over: a quiet session then ends the fixes.

const REVIEW_COMMAND = 'superpowers:requesting-code-review'
// The user's own prompts: a background agent's hand-back or a task notification must not cancel the chain.
const USER_ORIGINS = ['composer', 'bridge']
const ACTIVE_AGENT_STATUSES = ['pending', 'running']
// The step where the main assistant applies the review findings, and the step that follows it.
const FIX_NEXT: Partial<Record<Step, Step>> = { fix: 'idle' }
const STEP_LABELS: Record<Step, string> = {
  idle: '',
  simplify: 'simplify',
  review: 'review',
  fix: 'правки по ревью',
}
const SETTLE_MS = 1500
const FIX_START_GRACE_MS = 30 * 1000

const APPLY_FINDINGS_PROMPT = `Ревью завершено. Молча примени находки ревью, которые стоит исправить (Critical и Important; Minor — по своему усмотрению). Не пиши отчёт и не перечисляй замечания: после правок ответь одной короткой строкой.`

const REVIEW_SCOPE_INSTRUCTION = `## Polish scope (added by the polish mod)
Review the uncommitted changes in the working tree: BASE_SHA is HEAD, the diff is \`git diff HEAD\` plus the untracked files. Do not fix anything and do not commit at this step — report findings only; the fixes are applied in a separate step afterwards. Put the reviewer's findings (Critical / Important / Minor, with file:line) into your final message.`

async function reset($: EngineInterface): Promise<void> {
  await update($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step), () => 'idle')
  await update($, atom({ plugin: 'polish', key: 'fixGraceOver', id: await $.session.id() } as const, false), () => false)
}

// Agents started since the chain began that are still working.
async function hasActiveAgents($: EngineInterface): Promise<boolean> {
  const known = new Set((await read($, atom({ plugin: 'polish', key: 'baseline', id: await $.session.id() } as const, ''))).split(','))

  return (await $.agent.list()).some(agent => !known.has(agent.id) && ACTIVE_AGENT_STATUSES.includes(agent.status))
}

// Atomically moves the chain from one step to another; false when something else already did.
async function claim($: EngineInterface, from: Step, to: Step): Promise<boolean> {
  let isClaimed = false

  await update($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step), current => {
    isClaimed = current === from

    return isClaimed ? to : current
  })

  return isClaimed
}

// Cancel: stop the chain first (so no hook moves it on), then abort the running turn and the agents it started.
async function cancelAll($: EngineInterface): Promise<void> {
  const known = new Set((await read($, atom({ plugin: 'polish', key: 'baseline', id: await $.session.id() } as const, ''))).split(','))
  const turnId = await read($, atom({ plugin: 'polish', key: 'runningTurnId', id: await $.session.id() } as const, ''))

  await reset($)

  if (turnId !== '') {
    await $.turn.abort({ turnId }).catch(() => undefined)
  }

  const running = (await $.agent.list()).filter(
    agent => !known.has(agent.id) && ACTIVE_AGENT_STATUSES.includes(agent.status),
  )

  await Promise.all(
    running.map(agent => $.tool.call({ tool: 'TaskStop', task_id: agent.id }).catch(() => undefined)),
  )
}

// The only toasts the mod shows: a step that could not be started, so the chain stops for a reason.
async function fail($: EngineInterface, message: string): Promise<void> {
  await reset($)
  $.ui.toast(message)
}

async function run($: EngineInterface, command: string, args: string): Promise<void> {
  try {
    await $.command.run({ command, args })
  } catch (error) {
    await fail($, `Polish: не удалось запустить /${command}: ${String(error)}`)
  }
}

// Sets the chain up (state only); the caller starts the first step itself.
async function prepare($: EngineInterface): Promise<boolean> {
  if ((await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))) !== 'idle') {
    return false
  }

  const ids = (await $.agent.list()).map(agent => agent.id).join(',')
  const turns = await read($, atom({ plugin: 'polish', key: 'turnCount', id: await $.session.id() } as const, 0))

  await update($, atom({ plugin: 'polish', key: 'baseline', id: await $.session.id() } as const, ''), () => ids)
  await update($, atom({ plugin: 'polish', key: 'turnsAtStart', id: await $.session.id() } as const, 0), () => turns)
  await update($, atom({ plugin: 'polish', key: 'fixGraceOver', id: await $.session.id() } as const, false), () => false)
  await update($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step), () => 'simplify')

  return true
}

async function start($: EngineInterface): Promise<boolean> {
  const isPrepared = await prepare($)

  if (isPrepared) {
    void run($, 'simplify', '')
  }

  return isPrepared
}

// Both steps run as skills in the main loop and may end their turn right after launching background
// agents (/simplify does, the reviewer subagent may), then finish in a later turn. So a step is done only
// once a main turn started after the step began, no main turn is running or about to start, and none of
// the agents spawned since the chain began is still working.
// Called after every main turn and every agent turn; the settle pause lets a queued hand-back start
// the next main turn first, and that turn's own completion calls back in here.
async function advance($: EngineInterface, current: 'simplify' | 'review'): Promise<void> {
  const turnsBefore = await read($, atom({ plugin: 'polish', key: 'turnCount', id: await $.session.id() } as const, 0))

  await $.clock.sleep(SETTLE_MS)

  const isStale = (await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))) !== current || (await read($, atom({ plugin: 'polish', key: 'turnCount', id: await $.session.id() } as const, 0))) !== turnsBefore
  const isStarted = turnsBefore > (await read($, atom({ plugin: 'polish', key: 'turnsAtStart', id: await $.session.id() } as const, 0)))

  if (isStale || !isStarted || (await read($, atom({ plugin: 'polish', key: 'runningTurnId', id: await $.session.id() } as const, ''))) !== '') {
    return
  }

  if (await hasActiveAgents($)) {
    return
  }

  if (current === 'simplify') {
    if (await claim($, 'simplify', 'review')) {
      await runReview($)
    }
  } else if (await claim($, 'review', 'fix')) {
    await startFixes($, 'fix')
    void $.prompt.submit({ text: APPLY_FINDINGS_PROMPT })
  }
}

// The main assistant applies the review findings in its own turns.
// The next step waits for them: it starts once a turn started after the fixes began, no turn is running
// and no agent is still working. Nothing to fix may start no turn at all, hence the grace timer.
async function startFixes($: EngineInterface, phase: Step): Promise<void> {
  const turns = await read($, atom({ plugin: 'polish', key: 'turnCount', id: await $.session.id() } as const, 0))

  await update($, atom({ plugin: 'polish', key: 'turnsAtFix', id: await $.session.id() } as const, 0), () => turns)
  await update($, atom({ plugin: 'polish', key: 'fixGraceOver', id: await $.session.id() } as const, false), () => false)

  $.clock.after(FIX_START_GRACE_MS, () => {
    void expireFixGrace($, phase)
  })
}

async function expireFixGrace($: EngineInterface, phase: Step): Promise<void> {
  if ((await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))) !== phase) {
    return
  }

  await update($, atom({ plugin: 'polish', key: 'fixGraceOver', id: await $.session.id() } as const, false), () => true)
  await advanceFix($)
}

// Called after every main turn and every agent turn while the fixes run; the settle pause lets a queued
// turn start first, and that turn's own completion calls back in here.
async function advanceFix($: EngineInterface): Promise<void> {
  const turnsBefore = await read($, atom({ plugin: 'polish', key: 'turnCount', id: await $.session.id() } as const, 0))
  const phase = await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))

  await $.clock.sleep(SETTLE_MS)

  const next = FIX_NEXT[phase]
  const isStale = next === undefined || (await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))) !== phase || (await read($, atom({ plugin: 'polish', key: 'turnCount', id: await $.session.id() } as const, 0))) !== turnsBefore
  const isStarted = turnsBefore > (await read($, atom({ plugin: 'polish', key: 'turnsAtFix', id: await $.session.id() } as const, 0))) || (await read($, atom({ plugin: 'polish', key: 'fixGraceOver', id: await $.session.id() } as const, false)))

  if (isStale || !isStarted || (await read($, atom({ plugin: 'polish', key: 'runningTurnId', id: await $.session.id() } as const, ''))) !== '' || (await hasActiveAgents($))) {
    return
  }

  if (!(await claim($, phase, next))) {
    return
  }

  await update($, atom({ plugin: 'polish', key: 'fixGraceOver', id: await $.session.id() } as const, false), () => false)
}

// The review is a skill run in the main loop: its turns count from here, and advance() ends it.
async function runReview($: EngineInterface): Promise<void> {
  const turns = await read($, atom({ plugin: 'polish', key: 'turnCount', id: await $.session.id() } as const, 0))

  await update($, atom({ plugin: 'polish', key: 'turnsAtStart', id: await $.session.id() } as const, 0), () => turns)
  await run($, REVIEW_COMMAND, '')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'polish',
      description: 'simplify → superpowers:requesting-code-review → правки по находкам, без отчётов',
    })

    return next(e)
  })

  on('command.run', { command: 'polish' }, async ($, e) => {
    const isStarted = await prepare($)

    // A command run may not start another command from inside its own hook: the first step goes out
    // from a timer, a separate dispatch.
    if (isStarted) {
      $.clock.after(0, () => {
        void run($, 'simplify', '')
      })
    }

    return {
      text: isStarted
        ? 'Запущено: /simplify → /superpowers:requesting-code-review → правки'
        : 'Цепочка уже выполняется',
    }
  })

  // While the chain runs, the review is scoped to the working tree.
  on('skill.prompt', { skill: REVIEW_COMMAND }, async ($, e, next) => {
    const result = await next(e)

    if ((await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))) !== 'review') {
      return result
    }

    return { text: [result.text, REVIEW_SCOPE_INSTRUCTION].join('\n\n') }
  })

  on('turn.start', async ($, e, next) => {
    await update($, atom({ plugin: 'polish', key: 'turnCount', id: await $.session.id() } as const, 0), count => count + 1)
    await update($, atom({ plugin: 'polish', key: 'runningTurnId', id: await $.session.id() } as const, ''), () => e.turnId)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const current = await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))

    if (e.agentId !== undefined) {
      if (current === 'simplify' || current === 'review') {
        void advance($, current)
      } else if (FIX_NEXT[current] !== undefined) {
        void advanceFix($)
      }

      return next(e)
    }

    await update($, atom({ plugin: 'polish', key: 'runningTurnId', id: await $.session.id() } as const, ''), () => '')

    if (FIX_NEXT[current] !== undefined) {
      void advanceFix($)
    }

    if (current === 'simplify' || current === 'review') {
      if (e.reason !== 'answer') {
        await reset($)
      } else {
        void advance($, current)
      }
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Only a running skill step is cancelled by the user's message; while fixes run it only adds a turn.
    const current = await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))

    if ((current === 'simplify' || current === 'review') && USER_ORIGINS.includes(e.origin.kind)) {
      await reset($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const below = await next(e)
    const current = await read($, atom({ plugin: 'polish', key: 'step', id: await $.session.id() } as const, 'idle' as Step))
    const { Box, Button, Text } = $.ui.resolve(e)

    if (current === 'idle') {
      return (
        <Box>
          {below}
          <Button key="polish" label="Polish" hotkey="p" onPress={() => start($)} />
        </Box>
      )
    }

    return (
      <Box>
        {below}
        <Text dimColor>Polish: {STEP_LABELS[current]}… </Text>
        <Button key="cancel" label="Cancel" hotkey="c" onPress={() => cancelAll($)} />
      </Box>
    )
  })
}
