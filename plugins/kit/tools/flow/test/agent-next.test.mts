import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getStatus } from '../src/flow.mts'
import { nextPackage } from '../src/next.mts'
import { begin, closeThrough, expectBlocked, expectAgentPackage, expectNeedsInput, expectOk, reach, readStateFile, seed, tempRoot } from './support.mts'

const NOW = new Date(2026, 10, 23)

test('F1 U1: первый next на implement просит выбрать метод', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'implement')
  const before = readStateFile(root, 'A1')

  const response = expectNeedsInput(nextPackage({ root, now: NOW }))

  assert.deepEqual(response.options, ['inline', 'subagent-driven-development', 'codex-implement'])
  assert.match(response.question, /flow next --method/)
  assert.deepEqual(readStateFile(root, 'A1'), before)
})

test('F1 U2: выбранный метод записывается и возвращается пакет', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'implement')
  // После настоящего submit/wait путь плана хранится относительно корня репозитория.
  const state = readStateFile(root, 'A1')
  writeFileSync(join(root, 'tmp', 'flow', 'A1.json'), JSON.stringify({ ...state, stages: state.stages.map(stage => stage.name === 'plan' ? { ...stage, evidence: 'docs/plan.md' } : stage) }))

  const response = expectAgentPackage(nextPackage({ root, now: NOW, method: 'codex-implement' }))

  assert.equal(response.stage, 'implement')
  assert.equal(response.agentPackage.method, 'codex-implement')
  assert.equal(response.agentPackage.evidencePath, 'tmp/flow/A1/implement.md')
  assert.ok(response.agentPackage.instructions.join('\n').includes(join(root, 'docs', 'plan.md')))
  assert.equal(readStateFile(root, 'A1').method, 'codex-implement')
  assert.equal(expectAgentPackage(nextPackage({ root, now: NOW })).agentPackage.method, 'codex-implement')
})

test('F1 U3: неизвестный метод отклоняется', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'implement')

  const response = expectBlocked(nextPackage({ root, now: NOW, method: 'magic' }))

  assert.ok(response.reason.includes('inline') && response.reason.includes('codex-implement'))
  assert.equal(readStateFile(root, 'A1').method, undefined)
})

test('F1 U4: --method вне стадии implement отклоняется', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'simplify')

  const response = expectBlocked(nextPackage({ root, now: NOW, method: 'inline' }))

  assert.match(response.reason, /только на стадии implement/)
  assert.equal(readStateFile(root, 'A1').method, undefined)
})

test('F1 U6: пакет simplify различает агентов', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'simplify')

  const native = expectAgentPackage(nextPackage({ root, now: NOW })).agentPackage
  const other = expectAgentPackage(nextPackage({ root, now: NOW, agent: 'codex' })).agentPackage

  assert.equal(native.evidencePath, 'tmp/flow/A1/simplify.md')
  assert.match(native.instructions.join('\n'), /\/simplify/)
  assert.doesNotMatch(native.instructions.join('\n'), /kit:simplify/)
  assert.match(other.instructions.join('\n'), /kit:simplify/)
})

test('F1 U7: пакет check указывает ревью кода и файл итога', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'check')

  const pack = expectAgentPackage(nextPackage({ root, now: NOW })).agentPackage

  assert.equal(pack.evidencePath, 'tmp/flow/A1/check.md')
  assert.match(pack.instructions.join('\n'), /superpowers:requesting-code-review/)
  assert.match(pack.instructions.join('\n'), /молча/)
})

test('F1 U8: пакет local-test указывает skill и файл отчёта', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'local-test')

  const pack = expectAgentPackage(nextPackage({ root, now: NOW })).agentPackage

  assert.equal(pack.evidencePath, 'tmp/flow/A1/local-test.md')
  assert.match(pack.instructions.join('\n'), /kit:testing-changes/)
})

test('F1 U34: правка согласованного плана сбрасывает implement, метод и последующие стадии', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'implement')
  expectAgentPackage(nextPackage({ root, now: NOW, method: 'inline' }))
  closeThrough(root, 'A1', 'review')
  writeFileSync(join(root, 'docs', 'plan.md'), 'правка плана')

  const status = expectOk(getStatus({ root, id: 'A1' }))

  assert.equal(status.current, 'plan')
  assert.deepEqual(status.reset?.stages.slice(0, 7), ['plan', 'implement', 'simplify', 'check', 'local-test', 'review', 'pr'])
  assert.equal(readStateFile(root, 'A1').method, undefined)
})

test('F1 U36: пакеты review и pr указывают порядок действий', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'review')
  const review = expectAgentPackage(nextPackage({ root, now: NOW })).agentPackage.instructions.join('\n')
  closeThrough(root, 'A1', 'review')
  const pr = expectAgentPackage(nextPackage({ root, now: NOW })).agentPackage.instructions.join('\n')

  assert.match(review, /flow submit/)
  assert.match(review, /flow wait/)
  assert.match(pr, /pr-flow/)
  assert.match(pr, /flow done pr --evidence/)
})

test('F1 U35: недопустимый метод в состоянии считается повреждением', () => {
  const root = tempRoot()
  const state = seed(root, 'A1')
  writeFileSync(join(root, 'tmp', 'flow', 'A1.json'), JSON.stringify({ ...state, method: 'magic' }))

  const response = expectBlocked(getStatus({ root, id: 'A1' }))

  assert.match(response.reason, /Состояние повреждено/)
})
