import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { git, makeRepo, roadmap, ROADMAP, write } from './support.mts'

const step = (id: string, extra: object = {}): object => ({
  id, title: id, ticket: 'TBD', dependsOn: id === 'B1' ? ['A1'] : [], status: 'implemented', stepFolder: null, specPath: null, testPlanPath: null, planPath: null,
  estimate: { manual: { min: id === 'A1' ? 1 : 2, max: id === 'A1' ? 2 : 3 }, agent: { min: 0.5, max: 1 }, basis: 'initial', actualDays: null }, ...extra,
})
const stateJson = (steps: object[]): string => JSON.stringify({ feature: 'x', roadmapPath: 'docs/x/2026-01-01-x-roadmap.md', updatedAt: 'x', steps })
const PLAN = 'docs/x/steps/first/2026-01-01-A1-first.md'
const TESTS = 'docs/x/steps/first/2026-01-01-A1-first-tests.md'

function repo(extra: Record<string, string> = {}): { work: string } {
  return makeRepo({
    'docs/x/2026-01-01-x-roadmap.md': ROADMAP,
    'docs/x/roadmap-state.json': stateJson([step('A1', { stepFolder: 'docs/x/steps/first/', planPath: PLAN, testPlanPath: TESTS }), step('B1', { status: 'not-started' })]),
    [PLAN]: 'plan', [TESTS]: 'tests', 'docs/x/steps/first/2026-01-01-first-design.md': 'design', ...extra,
  })
}

test('CL1: close без данных flow и без --days — needs-input; ничего не изменено', () => {
  const { work } = repo()
  const response = roadmap(work, {}, 'close', 'A1')
  assert.equal(response.code, 2)
  assert.equal(existsSync(join(work, PLAN)), true)
})

test('CL2: close --days — чекбокс, планы удалены, дизайн остался, статус closed, actualDays, оценка', () => {
  const { work } = repo()
  const response = roadmap(work, {}, 'close', 'A1', '--days', '1.5')
  assert.equal(response.json.result, 'ok', response.stdout)
  const text = readFileSync(join(work, 'docs/x/2026-01-01-x-roadmap.md'), 'utf8')
  assert.match(text, /- \[x\] A1 — Первый шаг/)
  assert.match(text, /- \[ \] B1 — Второй шаг/)
  assert.equal(existsSync(join(work, PLAN)), false)
  assert.equal(existsSync(join(work, TESTS)), false)
  assert.equal(existsSync(join(work, 'docs/x/steps/first/2026-01-01-first-design.md')), true)
  const state = JSON.parse(readFileSync(join(work, 'docs/x/roadmap-state.json'), 'utf8'))
  assert.deepEqual([state.steps[0].status, state.steps[0].planPath, state.steps[0].testPlanPath, state.steps[0].estimate.actualDays], ['closed', null, null, 1.5])
  assert.match(text, /\| Осталось \(незакрытые шаги\) \| 2–3д \| 0\.5–1д \|/)
  assert.equal(git(work, 'status', '--porcelain').includes('A '), false)
})

test('CL3: последний шаг — роадмап и папка удалены', () => {
  const { work } = repo()
  roadmap(work, {}, 'close', 'A1', '--days', '1')
  write(work, 'docs/x/roadmap-state.json', stateJson([step('A1', { status: 'closed' }), step('B1')]))
  const response = roadmap(work, {}, 'close', 'B1', '--days', '2')
  assert.equal(response.json.roadmapDeleted, true)
  assert.equal(existsSync(join(work, 'docs/x')), false)
})

test('CL4: закрытый или неизвестный шаг — blocked', () => {
  const { work } = repo()
  assert.equal(roadmap(work, {}, 'close', 'ZZ', '--days', '1').json.result, 'blocked')
})

test('CL5: после pick изоляция снимается и скрытая папка возвращается', () => {
  const { work } = repo({ 'docs/other/roadmap.md': 'другой роадмап' })
  write(work, 'tmp/roadmap/isolated.json', JSON.stringify({ hidden: ['other'] }))
  git(work, 'sparse-checkout', 'set', '--no-cone', '/*', '!/docs/other/')
  assert.equal(existsSync(join(work, 'docs/other')), false)
  const response = roadmap(work, {}, 'close', 'A1', '--days', '1')
  assert.equal(response.json.result, 'ok', response.stdout)
  assert.equal(existsSync(join(work, 'tmp/roadmap/isolated.json')), false)
  assert.equal(existsSync(join(work, 'docs/other/roadmap.md')), true)
})

test('CL6: оставшийся маркер без активной изоляции не мешает закрытию', () => {
  const { work } = repo()
  write(work, 'tmp/roadmap/isolated.json', JSON.stringify({ hidden: ['other'] }))
  const response = roadmap(work, {}, 'close', 'A1', '--days', '1')
  assert.equal(response.json.result, 'ok', response.stdout)
  assert.equal(existsSync(join(work, 'tmp/roadmap/isolated.json')), false)
})
