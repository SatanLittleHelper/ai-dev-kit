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

const reviewAgent: AgentInfo = { id: 'review-1', description: 'code-review', type: 'general-purpose', status: 'running' }

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

test('the review waits for the simplify agents and its report is written once everything is done', async ($, on) => {
  const toasts = engine(on)
  const clock = mock.clock(on)
  const ran: string[] = []
  const written: string[] = []
  let agents: AgentInfo[] = []

  on('agent.list', () => ({ value: agents }))
  on('command.run', { command: 'simplify' }, () => {
    ran.push('simplify')
    agents = [{ id: 'simplify-1', description: 'reuse', type: 'Explore', status: 'running' }]

    return { text: '' }
  })
  on('command.run', { command: 'code-review' }, ($, e) => {
    ran.push(`code-review ${e.args}`)
    agents = [...agents, reviewAgent]

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

  expect(ran).toEqual(['simplify', 'code-review low'])

  await $.turn.complete(completion('review-turn', REVIEW_ANSWER, 'review-1'))

  expect(written).toHaveLength(1)

  const report = written[0] ?? ''

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
  on('command.run', { command: 'code-review' }, () => {
    ran.push('code-review')

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
  on('command.run', { command: 'code-review' }, () => {
    agents = [reviewAgent]

    return { text: '' }
  })
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
  await $.turn.complete(completion('review-turn', REVIEW_ANSWER, 'review-1'))
  await clock.settle()

  expect(prompts.join('\n')).toContain('a.js:1 — переименуй')
})

test('an empty Plannotator review sends nothing to the model', async ($, on) => {
  engine(on)
  const clock = mock.clock(on)
  const prompts: string[] = []
  let agents: AgentInfo[] = []

  on('agent.list', () => ({ value: agents }))
  on('command.run', { command: 'simplify' }, () => ({ text: '' }))
  on('command.run', { command: 'code-review' }, () => {
    agents = [reviewAgent]

    return { text: '' }
  })
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
  await $.turn.complete(completion('review-turn', REVIEW_ANSWER, 'review-1'))
  await clock.settle()

  expect(prompts).toEqual([])
})
