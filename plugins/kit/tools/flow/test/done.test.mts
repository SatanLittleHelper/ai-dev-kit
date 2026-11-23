import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { doneStage } from '../src/done.mts'
import { nextPackage } from '../src/next.mts'
import { begin, expectBlocked, expectOk, reach, readStateFile, stageOf, tempRoot, writeEvidence } from './support.mts'

const NOW = new Date(2026, 10, 23)

function done(root: string, stage: string, evidence?: string) {
  return doneStage({ root, cwd: root, id: 'A1', stage, evidence })
}

test('F1 U5: done implement без выбранного метода отклоняется', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'implement')
  const evidence = writeEvidence(root, 'A1', 'implement')

  const response = expectBlocked(done(root, 'implement', evidence))

  assert.match(response.reason, /flow next --method/)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'implement')?.status, 'pending')
})

test('F1 U9: закрытие по непустому файлу доказательства', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'simplify')
  const evidence = writeEvidence(root, 'A1', 'simplify')

  const response = expectOk(done(root, 'simplify', evidence))

  assert.equal(response.current, 'check')
  const stage = stageOf(readStateFile(root, 'A1'), 'simplify')
  assert.deepEqual([stage?.status, stage?.evidence], ['done', 'tmp/flow/A1/simplify.md'])
})

test('F1 U9: implement закрывается после выбора метода', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'implement')
  nextPackage({ root, now: NOW, method: 'inline' })

  const response = expectOk(done(root, 'implement', writeEvidence(root, 'A1', 'implement')))

  assert.equal(response.current, 'simplify')
})

test('F1 U10: закрытие без доказательства отклоняется', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'check')

  assert.match(expectBlocked(done(root, 'check')).reason, /нужно доказательство/)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'check')?.status, 'pending')
})

test('F1 U11: пустой или несуществующий файл не принимается', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'local-test')

  assert.match(expectBlocked(done(root, 'local-test', 'tmp/flow/A1/local-test.md')).reason, /не найден/)
  assert.match(expectBlocked(done(root, 'local-test', writeEvidence(root, 'A1', 'local-test', '  \n'))).reason, /пуст/)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'local-test')?.status, 'pending')
})

test('F1 U12: доказательство вне репозитория отклоняется', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'simplify')
  const outside = join(tempRoot(), 'simplify.md')
  writeFileSync(outside, 'итог')

  assert.match(expectBlocked(done(root, 'simplify', outside)).reason, /вне репозитория/)
})

test('F1 U13: закрытие стадии не по порядку отклоняется', () => {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'implement')

  const response = expectBlocked(done(root, 'check', writeEvidence(root, 'A1', 'check')))

  assert.match(response.reason, /implement/)
})

test('F1 U14: done для документных стадий и review отклоняется', () => {
  const root = tempRoot()
  begin(root)

  assert.match(expectBlocked(done(root, 'spec', writeEvidence(root, 'A1', 'spec'))).reason, /submit/)
  assert.match(expectBlocked(done(root, 'review', writeEvidence(root, 'A1', 'review'))).reason, /submit/)
  assert.equal(stageOf(readStateFile(root, 'A1'), 'spec')?.status, 'pending')
})
