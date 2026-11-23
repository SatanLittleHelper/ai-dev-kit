import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rmSync, writeFileSync } from 'node:fs'
import { getStatus } from '../src/flow.mts'
import { begin, closeThrough, docPath, expectOk, tempRoot } from './support.mts'

test('F2 U10: после review удаление плана и тест-плана не сбрасывает стадии; раньше и для спеки — сбрасывает', () => {
  const early = tempRoot()
  begin(early)
  closeThrough(early, 'A1', 'implement')
  rmSync(docPath(early, 'plan'))
  assert.equal(expectOk(getStatus({ root: early, id: 'A1' })).reset?.stages[0], 'plan')

  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'review')
  for (const name of ['test-plan', 'plan']) rmSync(docPath(root, name))

  const kept = expectOk(getStatus({ root, id: 'A1' }))
  assert.equal(kept.reset, undefined)
  assert.equal(kept.current, 'pr')

  rmSync(docPath(root, 'spec'))
  const reset = expectOk(getStatus({ root, id: 'A1' }))
  assert.equal(reset.reset?.reason, 'deleted')
  assert.equal(reset.reset?.stages[0], 'spec')
})

test('F2 U11: изменение согласованного документа после implement по-прежнему сбрасывает стадии', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'implement')
  writeFileSync(docPath(root, 'plan'), 'правка плана')

  const status = expectOk(getStatus({ root, id: 'A1' }))

  assert.equal(status.reset?.reason, 'changed')
  assert.equal(status.reset?.stages[0], 'plan')
  assert.equal(status.current, 'plan')
})
