import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { startTask } from '../src/flow.mts'
import { expectBlocked, expectOk, readStateFile, seed, stageOf, tempRoot } from './support.mts'

test('U1: start создаёт состояние с 10 стадиями', () => {
  const root = tempRoot()

  const response = expectOk(startTask({ root, id: 'A1' }))

  const state = readStateFile(root, 'A1')
  assert.deepEqual(state.stages.map(stage => stage.name), ['ticket', 'in-progress', 'spec', 'test-plan', 'plan', 'implement', 'polish', 'local-test', 'review', 'pr'])
  assert.equal(stageOf(state, 'ticket')?.status, 'done')
  assert.ok(state.stages.slice(1).every(stage => stage.status === 'pending'))
  assert.equal(response.current, 'in-progress')
})

test('U2: start с флагом no-tracker пропускает in-progress', () => {
  const root = tempRoot()

  const response = expectOk(startTask({ root, id: 'A1', noTracker: true }))

  const state = readStateFile(root, 'A1')
  assert.equal(stageOf(state, 'in-progress')?.status, 'skipped')
  assert.equal(stageOf(state, 'in-progress')?.reason, 'no-tracker')
  assert.equal(response.current, 'spec')
})

test('U3: повторный start не затирает задачу', () => {
  const root = tempRoot()
  seed(root, 'A1', [
    { name: 'ticket', status: 'done', evidence: 'A1' },
    { name: 'in-progress', status: 'skipped', reason: 'no-tracker' },
    { name: 'spec', status: 'done', evidence: 'готово' },
  ])

  const response = expectBlocked(startTask({ root, id: 'A1' }))

  assert.match(response.reason, /уже начата/)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'spec')?.status, 'done')
})

test('U4: start без id отклоняется', () => {
  const root = tempRoot()

  for (const id of [undefined, '', '   ']) {
    assert.match(expectBlocked(startTask({ root, id })).reason, /id не указан/)
  }

  assert.equal(existsSync(join(root, 'tmp')), false)
})

test('U5: id с разделителем пути отклоняется', () => {
  const root = tempRoot()

  for (const id of ['../evil', 'a/b']) {
    assert.match(expectBlocked(startTask({ root, id })).reason, /Недопустимый id/)
  }

  assert.equal(existsSync(join(root, 'tmp', 'flow')), false)
  assert.equal(existsSync(join(root, 'evil.json')), false)
})
