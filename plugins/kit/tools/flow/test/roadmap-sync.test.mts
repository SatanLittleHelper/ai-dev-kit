import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { closeStage, skipStage, startTask } from '../src/flow.mts'
import { begin, expectOk, tempRoot } from './support.mts'

const STEP_DIR = 'docs/feat/steps/step-a'
const ROADMAP = 'docs/feat/roadmap-state.json'

const step = (id: string, over: object = {}) => ({ id, title: id, status: 'not-started', stepFolder: null, specPath: null, testPlanPath: null, planPath: null, estimate: { manual: { min: 1, max: 2 }, basis: 'initial', actualDays: null }, ...over })

function write(root: string, rel: string, text: string): string {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
  return rel
}

function project(steps: object[] = [step('A2'), step('B1')], id = 'A2') {
  const root = tempRoot()
  write(root, ROADMAP, `${JSON.stringify({ feature: 'feat', updatedAt: '2026-01-01T00:00:00.000Z', steps }, null, 2)}\n`)
  expectOk(startTask({ root, id, noTracker: true, stepDir: STEP_DIR }))
  return root
}

const roadmap = (root: string) => JSON.parse(readFileSync(join(root, ROADMAP), 'utf8'))
const stepOf = (root: string, id: string) => roadmap(root).steps.find((candidate: { id: string }) => candidate.id === id)
const closeDoc = (root: string, stage: string, name: string, id = 'A2') => expectOk(closeStage({ root, id, stage, evidence: write(root, `${STEP_DIR}/${name}`, `документ ${name}`) }))

test('F2 U1: закрытие спеки отмечает шаг как согласованную спеку', () => {
  const root = project()

  closeDoc(root, 'spec', 'spec.md')

  const a2 = stepOf(root, 'A2')
  assert.deepEqual([a2.status, a2.specPath, a2.stepFolder], ['spec-validated', `${STEP_DIR}/spec.md`, `${STEP_DIR}/`])
  assert.notEqual(roadmap(root).updatedAt, '2026-01-01T00:00:00.000Z')
  assert.deepEqual(stepOf(root, 'B1'), step('B1'))
})

test('F2 U2: закрытие плана записывает путь плана и тест-плана', () => {
  const root = project()

  closeDoc(root, 'spec', 'spec.md')
  closeDoc(root, 'test-plan', 'tests.md')
  closeDoc(root, 'plan', 'plan.md')

  const a2 = stepOf(root, 'A2')
  assert.deepEqual([a2.status, a2.testPlanPath, a2.planPath], ['plan-drafted', `${STEP_DIR}/tests.md`, `${STEP_DIR}/plan.md`])
})

test('F2 U3: объединённый режим не заполняет путь тест-плана', () => {
  const root = project()

  closeDoc(root, 'spec', 'spec.md')
  expectOk(skipStage({ root, id: 'A2', stage: 'test-plan', reason: 'combined: небольшая задача' }))
  closeDoc(root, 'plan', 'plan.md')

  const a2 = stepOf(root, 'A2')
  assert.deepEqual([a2.status, a2.testPlanPath, a2.planPath], ['plan-drafted', null, `${STEP_DIR}/plan.md`])
})

test('F2 U4: закрытие implement отмечает шаг реализованным', () => {
  const root = project()

  closeDoc(root, 'spec', 'spec.md')
  closeDoc(root, 'test-plan', 'tests.md')
  closeDoc(root, 'plan', 'plan.md')
  expectOk(closeStage({ root, id: 'A2', stage: 'implement', evidence: 'tmp/flow/A2/implement.md' }))

  assert.equal(stepOf(root, 'A2').status, 'implemented')
})

test('F2 U5: статус не откатывается, закрытый шаг не трогается', () => {
  const higher = project([step('A2', { status: 'implemented' })])
  closeDoc(higher, 'spec', 'spec.md')
  const a2 = stepOf(higher, 'A2')
  assert.deepEqual([a2.status, a2.specPath], ['implemented', `${STEP_DIR}/spec.md`])

  const finished = project([step('A2', { status: 'closed' })])
  const before = readFileSync(join(finished, ROADMAP), 'utf8')
  closeDoc(finished, 'spec', 'spec.md')
  assert.equal(readFileSync(join(finished, ROADMAP), 'utf8'), before)
})

test('F2 U6: без папки шага, файла роадмапа или подходящего шага ничего не происходит', () => {
  const alone = tempRoot()
  begin(alone, 'A2')
  expectOk(closeStage({ root: alone, id: 'A2', stage: 'spec', evidence: write(alone, 'docs/spec.md', 'документ') }))

  const noFile = tempRoot()
  expectOk(startTask({ root: noFile, id: 'A2', noTracker: true, stepDir: STEP_DIR }))
  closeDoc(noFile, 'spec', 'spec.md')

  const noStep = project([step('Z1')])
  const before = readFileSync(join(noStep, ROADMAP), 'utf8')
  closeDoc(noStep, 'spec', 'spec.md')

  assert.throws(() => readFileSync(join(alone, ROADMAP)), /ENOENT/)
  assert.throws(() => readFileSync(join(noFile, ROADMAP)), /ENOENT/)
  assert.equal(readFileSync(join(noStep, ROADMAP), 'utf8'), before)
})

test('F2 U7: шаг находится по папке, даже если id задачи другой', () => {
  const root = project([step('X9', { stepFolder: `${STEP_DIR}/` }), step('A2')])

  closeDoc(root, 'spec', 'spec.md')

  assert.equal(stepOf(root, 'X9').status, 'spec-validated')
  assert.equal(stepOf(root, 'A2').status, 'not-started')
})

test('F2 U8: остальное содержимое сохраняется, повторное сохранение ничего не меняет', () => {
  const root = project([step('A2', { dependsOn: ['B1'] }), step('B1')])

  closeDoc(root, 'spec', 'spec.md')

  const after = roadmap(root)
  assert.equal(after.feature, 'feat')
  assert.deepEqual(after.steps[0].dependsOn, ['B1'])
  assert.deepEqual(after.steps[0].estimate, step('A2').estimate)
  assert.equal(after.steps.length, 2)

  const bytes = readFileSync(join(root, ROADMAP), 'utf8')
  expectOk(skipStage({ root, id: 'A2', stage: 'test-plan', reason: 'combined: небольшая задача' }))
  assert.equal(readFileSync(join(root, ROADMAP), 'utf8'), bytes)
})

test('F2 U9: повреждённый roadmap-state.json не ломает flow', () => {
  const root = project()
  write(root, ROADMAP, '{не json')

  closeDoc(root, 'spec', 'spec.md')

  assert.equal(readFileSync(join(root, ROADMAP), 'utf8'), '{не json')
})
