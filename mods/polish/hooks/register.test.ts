import type { AgentInfo } from 'claude-code'
import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// What the engine itself answers beneath the plugin in every test; toasts are kept for the assertions.
function engine(on: On, sessionId: () => string = () => 'session-a'): string[] {
  const toasts: string[] = []

  on('session.id', () => ({ value: sessionId() }))

  on('ui.toast', ($, e) => {
    toasts.push(JSON.stringify(e))

    return { value: undefined }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  return toasts
}

const AFTER_GRACE_MS = 35 * 1000

function completion(turnId: string, answer: string, agentId?: string) {
  return { turnId, answer, reason: 'answer' as const, durationMs: 1, isAborted: false, ...(agentId ? { agentId } : {}) }
}

type Ctx = Parameters<Parameters<typeof test>[1]>[0]

function chain(on: On) {
  const toasts = engine(on)
  const clock = mock.clock(on)
  const ran: string[] = []
  const prompts: string[] = []
  const spawned: string[][] = []
  const written: string[] = []
  const state = { agents: [] as AgentInfo[], simplifyAgents: [] as AgentInfo[] }

  on('agent.list', () => ({ value: state.agents }))
  on('command.run', { command: 'simplify' }, () => {
    ran.push('simplify')
    state.agents = state.simplifyAgents

    return { text: '' }
  })
  on('command.run', { command: 'superpowers:requesting-code-review' }, () => {
    ran.push('review')

    return { text: '' }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: '' }
  })
  on('fs.write', ($, e) => {
    written.push(e.text)

    return { value: undefined }
  })
  on('process.spawn', async function* (_$, e) {
    spawned.push(e.argv)

    return { value: { code: 0, signal: null } }
  })

  return { toasts, clock, ran, prompts, spawned, written, state }
}

// Runs /polish up to the moment the review turn has finished and the assistant was asked to apply the findings.
async function runToReviewDone($: Ctx, clock: ReturnType<typeof mock.clock>) {
  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  await $.turn.start({ text: '/simplify', turnId: 't1' })
  await $.turn.complete(completion('t1', 'simplified'))
  await clock.advance(2000)
  await $.turn.start({ text: '/superpowers:requesting-code-review', turnId: 't2' })
  await $.turn.complete(completion('t2', 'Found: b.js:3 [Critical]'))
  await clock.advance(2000)
}

test('/polish runs /simplify first and refuses a second start', async ($, on) => {
  const { toasts, clock, ran } = chain(on)

  const first = await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  const second = await $.command.run({ command: 'polish', args: '' })

  expect(toasts).toEqual([])
  expect(first.text).toContain('Запущено')
  expect(second.text).toContain('уже выполняется')
  expect(ran).toEqual(['simplify'])
})

test('a chain running in one session does not block /polish in another', async ($, on) => {
  let sessionId = 'session-a'
  const toasts = engine(on, () => sessionId)
  const ran: string[] = []

  on('agent.list', () => ({ value: [] }))
  on('command.run', { command: 'simplify' }, () => {
    ran.push(sessionId)

    return { text: '' }
  })

  const clock = mock.clock(on)
  const first = await $.command.run({ command: 'polish', args: '' })
  await clock.settle()

  sessionId = 'session-b'
  const other = await $.command.run({ command: 'polish', args: '' })
  await clock.settle()

  sessionId = 'session-a'
  const again = await $.command.run({ command: 'polish', args: '' })

  expect(toasts).toEqual([])
  expect(first.text).toContain('Запущено')
  expect(other.text).toContain('Запущено')
  expect(again.text).toContain('уже выполняется')
  expect(ran).toEqual(['session-a', 'session-b'])
})

test('the review waits for the simplify agents, starts without any report, and the findings are applied silently', async ($, on) => {
  const { clock, ran, prompts, spawned, written, state } = chain(on)

  state.simplifyAgents = [{ id: 'simplify-1', description: 'reuse', type: 'Explore', status: 'running' }]

  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  await $.turn.start({ text: '/simplify', turnId: 't1' })
  await $.turn.complete(completion('t1', 'launched four agents, waiting'))
  await clock.advance(2000)

  // the simplify agent is still working: the review must not start yet
  expect(ran).toEqual(['simplify'])

  state.agents = [{ id: 'simplify-1', description: 'reuse', type: 'Explore', status: 'completed' }]
  await $.turn.start({ text: 'agents reported', turnId: 't2' })
  await $.turn.complete(completion('t2', 'fixed a.js:1'))
  await clock.advance(2000)

  expect(ran).toEqual(['simplify', 'review'])

  await $.turn.start({ text: '/superpowers:requesting-code-review', turnId: 't2r' })
  await $.turn.complete(completion('t2r', 'Found: b.js:3 [Critical]'))
  await clock.advance(2000)

  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('Молча примени')

  await $.turn.start({ text: 'review reported', turnId: 't3' })
  await $.turn.complete(completion('t3', 'готово'))
  await clock.advance(2000)

  // no report was written and Plannotator was never opened
  expect(written).toEqual([])
  expect(spawned).toEqual([])
  expect(prompts).toHaveLength(1)

  // the chain is over: /polish can start again
  const again = await $.command.run({ command: 'polish', args: '' })

  expect(again.text).toContain('Запущено')
})

test('without any turn after the review the chain ends once the grace period has passed', async ($, on) => {
  const { clock, written, spawned } = chain(on)

  await runToReviewDone($, clock)
  await clock.advance(AFTER_GRACE_MS)

  expect(written).toEqual([])
  expect(spawned).toEqual([])

  const again = await $.command.run({ command: 'polish', args: '' })

  expect(again.text).toContain('Запущено')
})

test('an agent started while the fixes are applied holds the end of the chain back', async ($, on) => {
  const { clock, state } = chain(on)

  await runToReviewDone($, clock)
  await $.turn.start({ text: 'review reported', turnId: 't3' })
  state.agents = [{ id: 'fix-helper', description: 'checks the fix', type: 'Explore', status: 'running' }]
  await $.turn.complete(completion('t3', 'fixed'))
  await clock.advance(2000)

  const busy = await $.command.run({ command: 'polish', args: '' })

  expect(busy.text).toContain('уже выполняется')

  state.agents = [{ id: 'fix-helper', description: 'checks the fix', type: 'Explore', status: 'completed' }]
  await $.turn.complete(completion('helper-turn', 'checked', 'fix-helper'))
  await clock.advance(2000)

  const again = await $.command.run({ command: 'polish', args: '' })

  expect(again.text).toContain('Запущено')
})

test('a message typed while the fixes are applied does not drop the chain', async ($, on) => {
  const { clock } = chain(on)

  await runToReviewDone($, clock)
  await $.turn.start({ text: 'review reported', turnId: 't3' })
  await $.prompt.submit({ text: 'а что с портом?', origin: { kind: 'composer' } })

  const busy = await $.command.run({ command: 'polish', args: '' })

  expect(busy.text).toContain('уже выполняется')

  await $.turn.complete(completion('t3', 'fixed'))
  await clock.advance(2000)

  const again = await $.command.run({ command: 'polish', args: '' })

  expect(again.text).toContain('Запущено')
})

test('an aborted simplify turn stops the chain and /polish can start again', async ($, on) => {
  const { clock, ran } = chain(on)

  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  await $.turn.start({ text: '/simplify', turnId: 't1' })
  await $.turn.complete({ ...completion('t1', ''), reason: 'aborted', isAborted: true })
  await clock.advance(2000)

  expect(ran).toEqual(['simplify'])

  const again = await $.command.run({ command: 'polish', args: '' })
  await clock.settle()

  expect(again.text).toContain('Запущено')
})

test('the simplify prompt is left alone and the review prompt is scoped only while the chain runs', async ($, on) => {
  const { clock } = chain(on)

  on('skill.prompt', ($, e) => ({ text: e.text }))

  const before = await $.skill.prompt({ skill: 'superpowers:requesting-code-review', text: 'base' })

  expect(before.text).toBe('base')

  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()

  const simplify = await $.skill.prompt({ skill: 'simplify', text: 'base' })

  expect(simplify.text).toBe('base')

  await $.turn.start({ text: '/simplify', turnId: 't1' })
  await $.turn.complete(completion('t1', 'simplified'))
  await clock.advance(2000)

  const review = await $.skill.prompt({ skill: 'superpowers:requesting-code-review', text: 'base' })

  expect(review.text).toContain('Polish scope')
  expect(review.text).not.toContain('reviewed-not-reported')
})

test('Cancel aborts the running turn and stops the agents the chain started', async ($, on) => {
  const clock = mock.clock(on)
  const stopped: string[] = []
  const aborted: string[] = []
  let agents: AgentInfo[] = [{ id: 'old-1', description: 'earlier', type: 'Explore', status: 'running' }]

  engine(on)
  on('agent.list', () => ({ value: agents }))
  on('command.run', { command: 'simplify' }, () => {
    agents = [...agents, { id: 'simplify-1', description: 'reuse', type: 'Explore', status: 'running' }]

    return { text: '' }
  })
  on('tool.call', ($, e) => {
    stopped.push(String((e as { task_id?: string }).task_id))

    return { result: { text: 'stopped' } }
  })
  on('turn.abort', ($, e) => {
    aborted.push(e.turnId)

    return { value: undefined }
  })

  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  await $.turn.start({ text: '/simplify', turnId: 't1' })

  const band = await $.ui.mount({ plugin: 'polish', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } })

  await band.press({ key: 'cancel' })

  expect(aborted).toEqual(['t1'])
  // only the agent that appeared after the chain started is stopped, not the one that was already there
  expect(stopped).toEqual(['simplify-1'])

  const again = await $.command.run({ command: 'polish', args: '' })

  expect(again.text).toContain('Запущено')
})
