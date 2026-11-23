import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getStatus } from '../src/flow.mts'
import { submitDraft } from '../src/submit.mts'
import { renderText } from '../src/format.mts'
import { waitForDecision } from '../src/wait.mts'
import { begin, expectBlocked, expectNeedsInput, expectOk, reach, readStateFile, stageOf, tempRoot } from './support.mts'
import { stubRunners } from './runners-support.mts'
import type { StubOptions } from './runners-support.mts'

const NOW = new Date(2026, 10, 23)

function atReview(options: StubOptions) {
  const root = tempRoot()
  begin(root)
  reach(root, 'A1', 'review')
  const stub = stubRunners(options)
  const submit = () => submitDraft({ root, cwd: root, id: 'A1', runners: stub.runners, now: NOW })
  const wait = () => waitForDecision({ root, id: 'A1', timeoutMs: 0, sleep: () => {} })
  return { root, stub, submit, wait }
}

test('F1 U15: submit на стадии review запускает plannotator review', () => {
  const { root, stub, submit } = atReview({})

  const response = submit()

  assert.equal(response.result, 'pending')
  assert.equal(stub.calls.codeReview.length, 1)
  assert.equal(stub.calls.plannotator.length, 0)
  assert.match(stub.calls.codeReview[0].resultFile, /tmp\/flow-results\/A1\.review\./)
  assert.equal(readStateFile(root, 'A1').session?.stage, 'review')
  assert.match(renderText(response), /Ревью кода/)
})

test('F1 U16: wait с approved закрывает стадию review', () => {
  const { root, submit, wait } = atReview({ result: { decision: 'approved', message: 'Одобрено' } })
  submit()

  const response = wait()

  assert.equal(response.result, 'approved')
  const stage = stageOf(readStateFile(root, 'A1'), 'review')
  assert.equal(stage?.status, 'done')
  assert.match(stage?.evidence ?? '', /^tmp\/flow-results\/A1\.review\./)
  assert.equal(expectOk(getStatus({ root, id: 'A1' })).current, 'pr')
})

test('F1 U17: wait с annotated возвращает замечания и не закрывает стадию', () => {
  const { root, submit, wait } = atReview({ result: { decision: 'annotated', message: 'Переименуйте функцию' } })
  submit()

  const response = wait()

  assert.deepEqual([response.result, 'feedback' in response && response.feedback], ['annotated', 'Переименуйте функцию'])
  assert.equal(stageOf(readStateFile(root, 'A1'), 'review')?.status, 'pending')
  assert.equal(submit().result, 'pending')
})

test('F1 U18: «нет замечаний» не считается одобрением ревью', () => {
  const { root, submit, wait } = atReview({ result: { nothingToSend: true } })
  submit()

  expectNeedsInput(wait())

  assert.equal(stageOf(readStateFile(root, 'A1'), 'review')?.status, 'pending')
})

test('F1 U19: dismissed не закрывает стадию', () => {
  const { root, submit, wait } = atReview({ result: { decision: 'dismissed' } })
  submit()

  assert.equal(wait().result, 'dismissed')
  assert.equal(stageOf(readStateFile(root, 'A1'), 'review')?.status, 'pending')
})

test('F1 U20: сбой запуска plannotator не оставляет зависшей сессии', () => {
  const sync = atReview({ startError: new Error('plannotator не найден') })

  assert.match(expectBlocked(sync.submit()).reason, /plannotator не найден/)
  assert.equal(readStateFile(sync.root, 'A1').session, undefined)

  const later = atReview({ result: { error: 'plannotator завершился без результата: не найден' } })
  assert.equal(later.submit().result, 'pending')
  assert.match(expectBlocked(later.wait()).reason, /не найден/)
  assert.equal(later.submit().result, 'pending')
})
