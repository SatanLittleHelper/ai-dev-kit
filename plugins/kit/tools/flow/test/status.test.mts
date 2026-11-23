import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { getStatus, startTask } from '../src/flow.mts'
import { STAGE_NAMES } from '../src/stages.mts'
import { stateDir, statePath } from '../src/store.mts'
import type { Stage } from '../src/types.mts'
import { begin, expectBlocked, expectNeedsInput, expectOk, seed, tempRoot } from './support.mts'

const completed = (): Stage[] => STAGE_NAMES.map((name): Stage => ({ name, status: 'done', evidence: 'готово' }))

test('U6: повреждённый файл состояния не перезаписывается', () => {
  const root = tempRoot()
  mkdirSync(stateDir(root), { recursive: true })
  writeFileSync(statePath(root, 'ABC-1'), '{не json')

  const status = expectBlocked(getStatus({ root, id: 'ABC-1' }))
  const start = expectBlocked(startTask({ root, id: 'ABC-1' }))

  assert.match(status.reason, /повреждено/)
  assert.ok(status.reason.includes(statePath(root, 'ABC-1')))
  assert.match(start.reason, /повреждено/)
  assert.equal(readFileSync(statePath(root, 'ABC-1'), 'utf8'), '{не json')
})

test('U19: status показывает стадии, текущую и причины пропусков', () => {
  const root = tempRoot()
  seed(root, 'A1', [
    { name: 'ticket', status: 'done', evidence: 'A1' },
    { name: 'in-progress', status: 'skipped', reason: 'no-tracker' },
    { name: 'spec', status: 'done', evidence: 'готово' },
  ])

  const response = expectOk(getStatus({ root, id: 'A1' }))

  assert.equal(response.stages.length, 11)
  assert.equal(response.current, 'test-plan')
  assert.equal(response.stages.find(stage => stage.name === 'in-progress')?.reason, 'no-tracker')
})

test('U20: status без указания задачи берёт единственную незавершённую', () => {
  const root = tempRoot()
  seed(root, 'A0', completed())
  begin(root, 'A1')

  const response = expectOk(getStatus({ root }))

  assert.equal(response.task, 'A1')
})

test('U21: status при нескольких незавершённых задачах просит выбор', () => {
  const root = tempRoot()
  begin(root, 'A1')
  begin(root, 'A2')

  const response = expectNeedsInput(getStatus({ root }))

  assert.ok(response.question.length > 0)
  assert.deepEqual(response.options, ['A1', 'A2'])
})

test('U22: status без задач сообщает, как начать', () => {
  const root = tempRoot()

  const response = expectBlocked(getStatus({ root }))

  assert.match(response.reason, /не начата/)
  assert.match(response.reason, /flow start/)
})

test('U23: status неизвестной задачи', () => {
  const root = tempRoot()
  begin(root, 'A1')

  const response = expectBlocked(getStatus({ root, id: 'B7' }))

  assert.match(response.reason, /B7 не найдена/)
})

test('U24: status завершённой задачи', () => {
  const root = tempRoot()
  seed(root, 'A1', completed())

  const response = expectOk(getStatus({ root, id: 'A1' }))

  assert.equal(response.current, null)
  assert.equal(response.completed, true)
})
