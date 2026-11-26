import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import { getStatus, skipStage } from '../src/flow.mts'
import { begin, closeThrough, docPath, expectOk, readStateFile, stageOf, tempRoot } from './support.mts'

const FROM_SPEC = ['spec', 'test-plan', 'plan', 'implement', 'simplify', 'check', 'local-test', 'review', 'pr']

test('U25: изменённый документ сбрасывает свою и последующие стадии', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'plan')
  writeFileSync(docPath(root, 'spec'), 'правка')

  const response = expectOk(getStatus({ root, id: 'A1' }))

  assert.deepEqual(response.reset, { file: docPath(root, 'spec'), reason: 'changed', stages: FROM_SPEC })
  assert.equal(response.current, 'spec')
  assert.ok(response.stages.slice(2).every(stage => stage.status === 'pending'))
})

test('U26: неизменённый документ ничего не сбрасывает', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'test-plan')

  const first = expectOk(getStatus({ root, id: 'A1' }))
  const second = expectOk(getStatus({ root, id: 'A1' }))

  assert.deepEqual(first, second)
  assert.equal(first.reset, undefined)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'test-plan')?.status, 'done')
})

test('U27: удалённый документ считается изменённым', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'spec')
  rmSync(docPath(root, 'spec'))

  const response = expectOk(getStatus({ root, id: 'A1' }))

  assert.equal(response.reset?.reason, 'deleted')
  assert.equal(response.current, 'spec')
})

test('U28: пропуски после сброшенной стадии тоже сбрасываются', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'implement')
  expectOk(skipStage({ root, id: 'A1', stage: 'simplify', reason: 'только Markdown' }))
  writeFileSync(docPath(root, 'spec'), 'правка')

  expectOk(getStatus({ root, id: 'A1' }))

  const simplify = stageOf(readStateFile(root, 'A1'), 'simplify')
  assert.equal(simplify?.status, 'pending')
  assert.equal(simplify?.reason, undefined)
})

test('U29: изменение позднего документа не трогает ранние стадии', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'plan')
  const before = readStateFile(root, 'A1')
  writeFileSync(docPath(root, 'plan'), 'правка плана')

  const response = expectOk(getStatus({ root, id: 'A1' }))

  const after = readStateFile(root, 'A1')
  assert.deepEqual(stageOf(after, 'spec'), stageOf(before, 'spec'))
  assert.deepEqual(stageOf(after, 'test-plan'), stageOf(before, 'test-plan'))
  assert.deepEqual(response.reset?.stages, ['plan', 'implement', 'simplify', 'check', 'local-test', 'review', 'pr'])
  assert.equal(response.current, 'plan')
})

test('U30: сброс сохраняется в файле состояния', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'plan')
  writeFileSync(docPath(root, 'spec'), 'правка')

  getStatus({ root, id: 'A1' })

  const state = readStateFile(root, 'A1')
  assert.ok(state.stages.slice(2).every(stage => stage.status === 'pending'))
  assert.equal(stageOf(state, 'spec')?.hash, undefined)
})
