import type { AgentInfo } from 'claude-code'
import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

// What the engine itself answers beneath the plugin in every test; toasts are kept for the assertions.
function engine(on: On): string[] {
  const toasts: string[] = []

  on('ui.toast', ($, e) => {
    toasts.push(JSON.stringify(e))

    return { value: undefined }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  return toasts
}

const SIMPLIFY_ANSWER = [
  'Done.',
  '',
  '## Polish: fixed',
  '- a.js:1 — fixed it',
  '',
  '## Polish: skipped',
  '- a.js:42 — unused param — public API',
  '  ```js',
  '  # not a heading',
  '  function f(a, b) {}',
  '  ```',
].join('\n')

const REVIEW_ANSWER = [
  'Found nothing.',
  '',
  '## Polish: оценка пропусков simplify',
  '- a.js:42 — ok — fine',
  '',
  '## Polish: reviewed-not-reported',
  '- b.js:3 — maybe',
].join('\n')

const FEEDBACK_MARK = 'Замечания к отчёту Polish'

const FIX_ANSWER = 'Исправил b.js:3: проверка порта перенесена в начало.'
const AFTER_GRACE_MS = 35 * 1000

function completion(turnId: string, answer: string, agentId?: string) {
  return { turnId, answer, reason: 'answer' as const, durationMs: 1, isAborted: false, ...(agentId ? { agentId } : {}) }
}

test('/polish runs /simplify first and refuses a second start', async ($, on) => {
  const toasts = engine(on)
  const ran: string[] = []

  on('agent.list', () => ({ value: [] }))
  on('command.run', { command: 'simplify' }, () => {
    ran.push('simplify')

    return { text: '' }
  })

  const clock = mock.clock(on)
  const first = await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  const second = await $.command.run({ command: 'polish', args: '' })

  expect(toasts).toEqual([])
  expect(first.text).toContain('Запущено')
  expect(second.text).toContain('уже выполняется')
  expect(ran).toEqual(['simplify'])
})

test('the review waits for the simplify agents and the report is written once the fixes after the review are done', async ($, on) => {
  const toasts = engine(on)
  const clock = mock.clock(on)
  const ran: string[] = []
  const written: string[] = []
  const prompts: string[] = []
  let agents: AgentInfo[] = []

  on('agent.list', () => ({ value: agents }))
  on('command.run', { command: 'simplify' }, () => {
    ran.push('simplify')
    agents = [{ id: 'simplify-1', description: 'reuse', type: 'Explore', status: 'running' }]

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
  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })

  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  await $.turn.start({ text: '/simplify', turnId: 't1' })
  await $.turn.complete(completion('t1', 'launched four agents, waiting'))
  await clock.advance(2000)

  // the simplify agent is still working: the review must not start yet
  expect(ran).toEqual(['simplify'])

  agents = [{ id: 'simplify-1', description: 'reuse', type: 'Explore', status: 'completed' }]
  await $.turn.start({ text: 'agents reported', turnId: 't2' })
  await $.turn.complete(completion('t2', SIMPLIFY_ANSWER))
  await clock.advance(2000)

  expect(ran).toEqual(['simplify', 'review'])

  // the review runs in the main loop: its answer ends the step, then the assistant is asked to apply the findings
  await $.turn.start({ text: '/superpowers:requesting-code-review', turnId: 't2r' })
  await $.turn.complete(completion('t2r', REVIEW_ANSWER))
  await clock.advance(2000)

  expect(prompts).toHaveLength(1)

  // the review is over, but the main assistant has not applied its findings yet: nothing is shown
  expect(written).toHaveLength(0)

  await $.turn.start({ text: 'review reported', turnId: 't3' })
  await clock.advance(5000)

  // the fixes are being applied
  expect(written).toHaveLength(0)

  await $.turn.complete(completion('t3', FIX_ANSWER))
  await clock.advance(2000)

  expect(written).toHaveLength(1)

  const report = written[0] ?? ''

  expect(report).toContain('## Code review: исправлено после ревью')
  expect(report).toContain('проверка порта перенесена в начало')

  expect(report).toContain('## Simplify: исправлено')
  expect(report).toContain('a.js:1 — fixed it')
  expect(report).toContain('## Simplify: пропущено')
  expect(report).toContain('# not a heading')
  expect(report).toContain('## Code review: оценка пропусков simplify')
  expect(report).toContain('a.js:42 — ok — fine')
  expect(report).toContain('## Code review: рассмотрено, но не заявлено')
  expect(report).toContain('b.js:3 — maybe')
})

test('an aborted simplify turn stops the chain and /polish can start again', async ($, on) => {
  const toasts = engine(on)
  const clock = mock.clock(on)
  const ran: string[] = []

  on('agent.list', () => ({ value: [] }))
  on('command.run', { command: 'simplify' }, () => {
    ran.push('simplify')

    return { text: '' }
  })
  on('command.run', { command: 'superpowers:requesting-code-review' }, () => {
    ran.push('review')

    return { text: '' }
  })

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

test('the skill prompts are extended only while the chain runs', async ($, on) => {
  engine(on)
  const clock = mock.clock(on)

  on('agent.list', () => ({ value: [] }))
  on('command.run', { command: 'simplify' }, () => ({ text: '' }))
  on('skill.prompt', ($, e) => ({ text: e.text }))

  const before = await $.skill.prompt({ skill: 'simplify', text: 'base' })

  expect(before.text).toBe('base')

  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()

  const during = await $.skill.prompt({ skill: 'simplify', text: 'base' })

  expect(during.text).toContain('## Polish: fixed')
  expect(during.text).toContain('## Polish: skipped')
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

test('the annotations from Plannotator go to the model as a prompt', async ($, on) => {
  engine(on)
  const clock = mock.clock(on)
  const prompts: string[] = []
  let agents: AgentInfo[] = []

  on('agent.list', () => ({ value: agents }))
  on('command.run', { command: 'simplify' }, () => ({ text: '' }))
  on('command.run', { command: 'superpowers:requesting-code-review' }, () => ({ text: '' }))
  on('fs.write', () => ({ value: undefined }))
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: '# File Feedback\n1. a.js:1 — переименуй' }

    return { value: { code: 0, signal: null } }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: '' }
  })

  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  await $.turn.start({ text: '/simplify', turnId: 't1' })
  await $.turn.complete(completion('t1', SIMPLIFY_ANSWER))
  await clock.advance(2000)
  await $.turn.start({ text: '/superpowers:requesting-code-review', turnId: 't2' })
  await $.turn.complete(completion('t2', REVIEW_ANSWER))
  await clock.advance(AFTER_GRACE_MS)
  await clock.settle()

  expect(prompts.filter(text => text.includes(FEEDBACK_MARK)).join('\n')).toContain('a.js:1 — переименуй')
})

test('an empty Plannotator review sends nothing to the model', async ($, on) => {
  engine(on)
  const clock = mock.clock(on)
  const prompts: string[] = []
  let agents: AgentInfo[] = []

  on('agent.list', () => ({ value: agents }))
  on('command.run', { command: 'simplify' }, () => ({ text: '' }))
  on('command.run', { command: 'superpowers:requesting-code-review' }, () => ({ text: '' }))
  on('fs.write', () => ({ value: undefined }))
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: 'User reviewed the document and has no feedback.\n' }

    return { value: { code: 0, signal: null } }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: '' }
  })

  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  await $.turn.start({ text: '/simplify', turnId: 't1' })
  await $.turn.complete(completion('t1', SIMPLIFY_ANSWER))
  await clock.advance(2000)
  await $.turn.start({ text: '/superpowers:requesting-code-review', turnId: 't2' })
  await $.turn.complete(completion('t2', REVIEW_ANSWER))
  await clock.advance(AFTER_GRACE_MS)
  await clock.settle()

  expect(prompts.filter(text => text.includes(FEEDBACK_MARK))).toEqual([])
})

type Ctx = Parameters<Parameters<typeof test>[1]>[0]

function chain(on: On) {
  const toasts = engine(on)
  const clock = mock.clock(on)
  const written: string[] = []
  const prompts: string[] = []
  const state = { agents: [] as AgentInfo[] }

  on('agent.list', () => ({ value: state.agents }))
  on('command.run', { command: 'simplify' }, () => ({ text: '' }))
  on('command.run', { command: 'superpowers:requesting-code-review' }, () => ({ text: '' }))
  on('fs.write', ($, e) => {
    written.push(e.text)

    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: '' }
  })

  return { toasts, clock, written, prompts, state }
}

// Runs /polish up to the moment the review turn has finished and the assistant was asked to apply the findings.
async function runToReviewDone($: Ctx, clock: ReturnType<typeof mock.clock>) {
  await $.command.run({ command: 'polish', args: '' })
  await clock.settle()
  await $.turn.start({ text: '/simplify', turnId: 't1' })
  await $.turn.complete(completion('t1', SIMPLIFY_ANSWER))
  await clock.advance(2000)
  await $.turn.start({ text: '/superpowers:requesting-code-review', turnId: 't2' })
  await $.turn.complete(completion('t2', REVIEW_ANSWER))
  await clock.advance(2000)
}

test('without any turn after the review the report opens once the grace period has passed', async ($, on) => {
  const { clock, written, state } = chain(on)

  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })

  await runToReviewDone($, clock)
  await clock.advance(2000)

  expect(written).toHaveLength(0)

  await clock.advance(AFTER_GRACE_MS)

  expect(written).toHaveLength(1)
  expect(written[0]).toContain('## Code review: исправлено после ревью')
  expect(written[0]).toContain('правок после ревью не было')
})

test('an agent started while the fixes are applied holds the report back', async ($, on) => {
  const { clock, written, state } = chain(on)

  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })

  await runToReviewDone($, clock)
  await $.turn.start({ text: 'review reported', turnId: 't3' })
  state.agents = [{ id: 'fix-helper', description: 'checks the fix', type: 'Explore', status: 'running' }]
  await $.turn.complete(completion('t3', FIX_ANSWER))
  await clock.advance(2000)

  expect(written).toHaveLength(0)

  state.agents = [{ id: 'fix-helper', description: 'checks the fix', type: 'Explore', status: 'completed' }]
  await $.turn.complete(completion('helper-turn', 'checked', 'fix-helper'))
  await clock.advance(2000)

  expect(written).toHaveLength(1)
})

test('a message typed while the fixes are applied does not drop the report', async ($, on) => {
  const { clock, written } = chain(on)

  on('process.spawn', async function* () {
    return { value: { code: 0, signal: null } }
  })

  await runToReviewDone($, clock)
  await $.turn.start({ text: 'review reported', turnId: 't3' })
  await $.prompt.submit({ text: 'а что с портом?', origin: { kind: 'composer' } })
  await $.turn.complete(completion('t3', FIX_ANSWER))
  await clock.advance(2000)

  expect(written).toHaveLength(1)
})

test('the annotations from Plannotator wait for a running turn before they go to the model', async ($, on) => {
  const { clock, prompts } = chain(on)
  let release = () => {}
  const released = new Promise<void>(resolve => {
    release = resolve
  })

  on('process.spawn', async function* () {
    await released
    yield { stream: 'stdout' as const, text: '# File Feedback\n1. a.js:1 — переименуй' }

    return { value: { code: 0, signal: null } }
  })

  await runToReviewDone($, clock)
  await $.turn.start({ text: 'review reported', turnId: 't3' })
  await $.turn.complete(completion('t3', FIX_ANSWER))
  await clock.advance(2000)
  await $.turn.start({ text: 'ещё вопрос', turnId: 't4' })
  release()
  await clock.advance(2000)

  expect(prompts.filter(text => text.includes(FEEDBACK_MARK))).toEqual([])

  await $.turn.complete(completion('t4', 'ответ'))
  await clock.advance(2000)

  expect(prompts.filter(text => text.includes(FEEDBACK_MARK)).join('\n')).toContain('a.js:1 — переименуй')
})
