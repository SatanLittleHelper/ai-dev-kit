import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { skipStage } from '../src/flow.mts'
import { guard } from '../src/guard.mts'
import type { GuardEvent } from '../src/guard.mts'
import { begin, closeThrough, docPath, readStateFile, tempRoot } from './support.mts'

const BRANCH = 'task-flow-f1'

const ask = (root: string, event: GuardEvent, branch = BRANCH, stopActive = false) => guard({ root, event, branch, stopActive })

test('E1 хуки U1: задача находится по id в имени ветки', () => {
  const root = tempRoot()
  begin(root, 'F1')

  const answer = ask(root, 'stop')

  assert.equal(answer.decision, 'deny')
  assert.match(answer.message ?? '', /F1/)
})

test('E1 хуки U2: id совпадает только как отдельный токен', () => {
  const root = tempRoot()
  begin(root, 'F1')

  const answer = ask(root, 'stop', 'task-flow-f10')

  assert.deepEqual(answer, { result: 'guard', decision: 'allow' })
})

test('E1 хуки U3: при нескольких подходящих задачах побеждает самый длинный id', () => {
  const root = tempRoot()
  begin(root, 'F1')
  begin(root, 'F1-fix')

  const answer = ask(root, 'stop', 'task-flow-f1-fix')

  assert.equal(answer.decision, 'deny')
  assert.match(answer.message ?? '', /F1-fix/)
})

test('E1 хуки U4: нет состояния или ветка чужая — разрешено', () => {
  const empty = tempRoot()
  assert.deepEqual(ask(empty, 'push', 'main'), { result: 'guard', decision: 'allow' })

  const root = tempRoot()
  begin(root, 'F1')
  assert.deepEqual(ask(root, 'push', 'main'), { result: 'guard', decision: 'allow' })
})

test('E1 хуки U5: завершённая задача не блокирует', () => {
  const root = tempRoot()
  begin(root, 'F1')
  closeThrough(root, 'F1', 'pr')

  assert.equal(ask(root, 'stop').decision, 'allow')
  assert.equal(ask(root, 'push').decision, 'allow')

  writeFileSync(docPath(root, 'spec'), 'правка после завершения')
  assert.equal(ask(root, 'push').decision, 'deny')
})

test('E1 хуки U6: повреждённое состояние не блокирует', () => {
  const root = tempRoot()
  mkdirSync(join(root, 'tmp', 'flow'), { recursive: true })
  writeFileSync(join(root, 'tmp', 'flow', 'F1.json'), '{')

  for (const event of ['stop', 'push', 'session-start'] as const) {
    assert.deepEqual(ask(root, event), { result: 'guard', decision: 'allow' })
  }

  const neighbour = tempRoot()
  begin(neighbour, 'F1')
  writeFileSync(join(neighbour, 'tmp', 'flow', 'X9.json'), '{')
  assert.equal(ask(neighbour, 'stop').decision, 'deny')
})

test('E1 хуки U7: session-start печатает статус задачи', () => {
  const root = tempRoot()
  begin(root, 'F1')

  const answer = ask(root, 'session-start')

  assert.equal(answer.decision, 'allow')
  assert.match(answer.message ?? '', /Задача F1/)
  assert.match(answer.message ?? '', /Текущая стадия: spec/)
})

test('E1 хуки U8: session-start без задачи молчит', () => {
  assert.deepEqual(ask(tempRoot(), 'session-start'), { result: 'guard', decision: 'allow' })
})

test('E1 хуки U9: остановка посреди стадии отклоняется с напоминанием', () => {
  const root = tempRoot()
  begin(root, 'F1')

  const answer = ask(root, 'stop')

  assert.equal(answer.decision, 'deny')
  assert.match(answer.message ?? '', /F1/)
  assert.match(answer.message ?? '', /spec/)
  assert.match(answer.message ?? '', /flow status/)
})

test('E1 хуки U10: повторная остановка в том же ходу проходит', () => {
  const root = tempRoot()
  begin(root, 'F1')

  assert.equal(ask(root, 'stop', BRANCH, true).decision, 'allow')
})

test('E1 хуки U11: ожидание ответа Plannotator не блокирует остановку', () => {
  const root = tempRoot()
  begin(root, 'F1')
  const state = readStateFile(root, 'F1')
  const session = { stage: 'spec', draft: 'd', target: 't', resultFile: 'r', draftHash: 'h', status: 'open', startedAt: '2026-11-23T00:00:00.000Z' }
  writeFileSync(join(root, 'tmp', 'flow', 'F1.json'), JSON.stringify({ ...state, session }))

  assert.equal(ask(root, 'stop').decision, 'allow')
})

test('E1 хуки U12: остановка без задачи разрешена', () => {
  assert.deepEqual(ask(tempRoot(), 'stop'), { result: 'guard', decision: 'allow' })
})

test('E1 хуки U13: push с незакрытыми стадиями отклоняется', () => {
  const root = tempRoot()
  begin(root, 'F1')
  closeThrough(root, 'F1', 'implement')

  const answer = ask(root, 'push')

  assert.equal(answer.decision, 'deny')
  assert.match(answer.message ?? '', /simplify, check, local-test, review/)
  assert.match(answer.message ?? '', /F1/)
  assert.match(answer.message ?? '', /flow status/)
})

test('E1 хуки U14: закрытые или пропущенные с причиной стадии разрешают push', () => {
  const closed = tempRoot()
  begin(closed, 'F1')
  closeThrough(closed, 'F1', 'review')
  assert.equal(ask(closed, 'push').decision, 'allow')

  const skipped = tempRoot()
  begin(skipped, 'F1')
  closeThrough(skipped, 'F1', 'implement')
  for (const stage of ['simplify', 'check', 'local-test', 'review']) {
    const response = skipStage({ root: skipped, id: 'F1', stage, reason: 'не требуется' })
    assert.equal(response.result, 'ok')
  }
  assert.equal(ask(skipped, 'push').decision, 'allow')
})

test('E1 хуки U15: создание PR проходит тот же барьер', () => {
  const root = tempRoot()
  begin(root, 'F1')
  closeThrough(root, 'F1', 'implement')

  const answer = ask(root, 'pr')

  assert.equal(answer.decision, 'deny')
  assert.match(answer.message ?? '', /создать PR/)
  assert.match(answer.message ?? '', /simplify, check, local-test, review/)

  closeThrough(root, 'F1', 'review')
  assert.equal(ask(root, 'pr').decision, 'allow')
})
