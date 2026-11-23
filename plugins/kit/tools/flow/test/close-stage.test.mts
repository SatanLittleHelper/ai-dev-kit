import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { closeStage } from '../src/flow.mts'
import { begin, closeThrough, expectBlocked, expectOk, readStateFile, stageOf, tempRoot, writeDoc } from './support.mts'

test('U7: закрытие текущей стадии продвигает задачу', () => {
  const root = tempRoot()
  begin(root)

  const response = expectOk(closeStage({ root, id: 'A1', stage: 'spec', evidence: writeDoc(root, 'spec') }))

  assert.equal(response.current, 'test-plan')
  assert.equal(stageOf(readStateFile(root, 'A1'), 'spec')?.status, 'done')
})

test('U8: закрытие не текущей стадии отклоняется', () => {
  const root = tempRoot()
  begin(root)
  const before = readStateFile(root, 'A1')

  const response = expectBlocked(closeStage({ root, id: 'A1', stage: 'plan', evidence: writeDoc(root, 'plan') }))

  assert.match(response.reason, /spec/)
  assert.deepEqual(readStateFile(root, 'A1'), before)
})

test('U9: повторное закрытие уже закрытой стадии отклоняется', () => {
  const root = tempRoot()
  begin(root)
  const evidence = writeDoc(root, 'spec')
  expectOk(closeStage({ root, id: 'A1', stage: 'spec', evidence }))
  const before = readStateFile(root, 'A1')

  const response = expectBlocked(closeStage({ root, id: 'A1', stage: 'spec', evidence }))

  assert.match(response.reason, /уже закрыта/)
  assert.deepEqual(readStateFile(root, 'A1'), before)
})

test('U10: неизвестное имя стадии отклоняется', () => {
  const root = tempRoot()
  begin(root)

  const response = expectBlocked(closeStage({ root, id: 'A1', stage: 'deploy', evidence: 'готово' }))

  assert.match(response.reason, /Неизвестная стадия/)
  assert.ok(response.reason.includes('spec'))
})

test('U11: закрытие без доказательства отклоняется', () => {
  const root = tempRoot()
  begin(root)

  for (const evidence of [undefined, '']) {
    assert.match(expectBlocked(closeStage({ root, id: 'A1', stage: 'spec', evidence })).reason, /нужно доказательство/)
  }

  assert.equal(stageOf(readStateFile(root, 'A1'), 'spec')?.status, 'pending')
})

test('U12: документная стадия требует существующий файл', () => {
  const root = tempRoot()
  begin(root)

  const response = expectBlocked(closeStage({ root, id: 'A1', stage: 'spec', evidence: join(root, 'docs', 'нет.md') }))

  assert.match(response.reason, /Файл не найден/)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'spec')?.status, 'pending')
})

test('U13: закрытие документной стадии запоминает хеш', () => {
  const root = tempRoot()
  begin(root)
  const evidence = writeDoc(root, 'spec', 'текст спеки')

  expectOk(closeStage({ root, id: 'A1', stage: 'spec', evidence }))

  const spec = stageOf(readStateFile(root, 'A1'), 'spec')
  assert.equal(spec?.evidence, evidence)
  assert.equal(spec?.hash, createHash('sha256').update('текст спеки').digest('hex'))
})

test('U14: не документная стадия закрывается строкой-доказательством', () => {
  const root = tempRoot()
  begin(root)
  closeThrough(root, 'A1', 'review')

  const response = expectOk(closeStage({ root, id: 'A1', stage: 'pr', evidence: 'https://example.test/pr/1' }))

  assert.equal(response.completed, true)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'pr')?.evidence, 'https://example.test/pr/1')
})
