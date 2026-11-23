import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closeStage, skipStage } from '../src/flow.mts'
import { begin, closeThrough, expectBlocked, expectOk, readStateFile, stageOf, tempRoot, writeDoc } from './support.mts'

test('U15: skip текущей стадии с причиной', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'implement')

  const response = expectOk(skipStage({ root, id: 'A1', stage: 'polish', reason: 'правки только в Markdown' }))

  const polish = stageOf(readStateFile(root, 'A1'), 'polish')
  assert.equal(polish?.status, 'skipped')
  assert.equal(polish?.reason, 'правки только в Markdown')
  assert.equal(response.current, 'local-test')
})

test('U16: skip без причины отклоняется', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'implement')

  for (const reason of [undefined, '   ']) {
    const response = expectBlocked(skipStage({ root, id: 'A1', stage: 'polish', reason }))
    assert.match(response.reason, /нужна причина/)
    assert.ok(response.reason.includes('polish'))
  }

  assert.equal(stageOf(readStateFile(root, 'A1'), 'polish')?.status, 'pending')
})

test('U17: skip не текущей стадии отклоняется', () => {
  const root = tempRoot()
  begin(root)

  const response = expectBlocked(skipStage({ root, id: 'A1', stage: 'review', reason: 'не нужно' }))

  assert.match(response.reason, /spec/)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'review')?.status, 'pending')
})

test('U18: skip закрытой стадии отклоняется', () => {
  const root = tempRoot()
  begin(root)
  expectOk(closeStage({ root, id: 'A1', stage: 'spec', evidence: writeDoc(root, 'spec') }))
  const before = stageOf(readStateFile(root, 'A1'), 'spec')

  const response = expectBlocked(skipStage({ root, id: 'A1', stage: 'spec', reason: 'передумали' }))

  assert.match(response.reason, /уже закрыта/)
  assert.deepEqual(stageOf(readStateFile(root, 'A1'), 'spec'), before)
})
