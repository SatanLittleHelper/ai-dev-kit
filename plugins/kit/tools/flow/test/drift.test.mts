import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { syncDrift } from '../src/drift.mts'
import { closeStage, getStatus, skipStage } from '../src/flow.mts'
import { nextPackage } from '../src/next.mts'
import { restartStage } from '../src/restart.mts'
import { begin, closeThrough, docPath, expectBlocked, expectOk, readStateFile, stageOf, tempRoot, writeDoc } from './support.mts'

const NOW = new Date('2026-01-02T03:04:05Z')

// Спека и тест-план согласованы, идёт работа над планом; спеку правят.
function planInProgress(): string {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'test-plan')
  writeFileSync(docPath(root, 'spec'), 'правка спеки')
  return root
}

test('D1: правка согласованного документа во время работы над следующим не сбрасывает стадии', () => {
  const root = planInProgress()

  const status = expectOk(getStatus({ root, id: 'A1' }))

  assert.equal(status.reset, undefined)
  assert.equal(status.current, 'plan')
  assert.equal(stageOf(readStateFile(root, 'A1'), 'spec')?.status, 'done')
  assert.deepEqual(status.drift, [{ stage: 'spec', file: stageOf(readStateFile(root, 'A1'), 'spec')?.evidence }])
})

test('D2: пока документ текущей стадии не согласован, sync отказывает', () => {
  const root = planInProgress()

  assert.match(expectBlocked(syncDrift({ root, id: 'A1' })).reason, /approved документа стадии plan/)
  assert.equal(expectOk(getStatus({ root, id: 'A1' })).current, 'plan')
})

test('D3: после approved текущего документа стадии стоят, пока расхождение не принято', () => {
  const root = planInProgress()
  expectOk(closeStage({ root, id: 'A1', stage: 'plan', evidence: writeDoc(root, 'plan') }))

  assert.match(expectBlocked(nextPackage({ root, id: 'A1', now: NOW })).reason, /flow sync/)
  assert.match(expectBlocked(skipStage({ root, id: 'A1', stage: 'implement', reason: 'нет' })).reason, /flow sync/)
})

test('D4: sync молча принимает правку и не сбрасывает следующие стадии', () => {
  const root = planInProgress()
  expectOk(closeStage({ root, id: 'A1', stage: 'plan', evidence: writeDoc(root, 'plan') }))
  writeFileSync(docPath(root, 'spec'), 'ещё правка при приведении')

  const synced = expectOk(syncDrift({ root, id: 'A1' }))

  assert.equal(synced.drift, undefined)
  assert.equal(synced.current, 'implement')
  assert.equal(stageOf(readStateFile(root, 'A1'), 'plan')?.status, 'done')
  assert.equal(expectOk(getStatus({ root, id: 'A1' })).reset, undefined)
})

test('D5: после sync новая правка снова сбрасывает стадии как обычно', () => {
  const root = planInProgress()
  expectOk(closeStage({ root, id: 'A1', stage: 'plan', evidence: writeDoc(root, 'plan') }))
  expectOk(syncDrift({ root, id: 'A1' }))
  writeFileSync(docPath(root, 'spec'), 'правка после синхронизации')

  const status = expectOk(getStatus({ root, id: 'A1' }))

  assert.equal(status.reset?.stages[0], 'spec')
})

test('D6: sync без расхождений отказывает', () => {
  const root = tempRoot()
  begin(root)

  assert.match(expectBlocked(syncDrift({ root, id: 'A1' })).reason, /нечего/)
})

test('D7: правка документа без расхождения после его approved сбрасывает стадии', () => {
  const root = planInProgress()
  expectOk(closeStage({ root, id: 'A1', stage: 'plan', evidence: writeDoc(root, 'plan') }))
  writeFileSync(docPath(root, 'plan'), 'правка плана')

  const status = expectOk(getStatus({ root, id: 'A1' }))

  assert.equal(status.reset?.stages[0], 'plan')
  assert.equal(status.current, 'plan')
})

test('R1: restart сбрасывает стадию и следующие, чистит черновик и записывает причину', () => {
  const root = planInProgress()
  expectOk(getStatus({ root, id: 'A1' }))
  mkdirSync(join(root, 'tmp', 'drafts'), { recursive: true })
  const draft = join(root, 'tmp', 'drafts', 'a1-design.md')
  writeFileSync(draft, 'черновик')

  const response = expectOk(restartStage({ root, id: 'A1', stage: 'spec', reason: 'задача другая', now: NOW }))

  const state = readStateFile(root, 'A1')
  assert.equal(response.current, 'spec')
  assert.ok(state.stages.slice(2).every(stage => stage.status === 'pending' && stage.evidence === undefined))
  assert.equal(state.drift, undefined)
  assert.deepEqual(state.restarts, [{ from: 'spec', reason: 'задача другая', at: NOW.toISOString() }])
  assert.equal(existsSync(draft), false)
})

test('R2: restart требует причину и документную стадию', () => {
  const root = tempRoot()
  begin(root)

  assert.match(expectBlocked(restartStage({ root, id: 'A1', stage: 'spec', now: NOW })).reason, /причина/)
  assert.match(expectBlocked(restartStage({ root, id: 'A1', stage: 'implement', reason: 'x', now: NOW })).reason, /документной/)
})
