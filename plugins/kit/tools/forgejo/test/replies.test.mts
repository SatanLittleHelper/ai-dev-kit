import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PublishUnknownError } from '../src/types.mts'
import { API, failure, ok, provider } from './helpers.mts'

const THREAD_POST = `POST ${API}/pulls/42/reviews/11/comments`
const ISSUE_POST = `POST ${API}/issues/42/comments`
const bodyOf = (call: { init?: { body?: string } }) => JSON.parse(call.init?.body ?? '{}') as Record<string, unknown>

test('U26: ответ в тред уходит комментарием в то же ревью и место', async () => {
  const { instance, calls } = provider({ [THREAD_POST]: ok('{}') })
  await instance.publishReplies(42, [{ threadId: '11:src/a.ts:7', body: 'Исправил' }])
  assert.deepEqual(bodyOf(calls[0]), { path: 'src/a.ts', new_position: 7, body: 'Исправил' })
})

test('U27: общий ответ — issue-комментарий с цитатой', async () => {
  const { instance, calls } = provider({ [ISSUE_POST]: [ok('{}'), ok('{}')] })
  await instance.publishReplies(42, [{ quote: 'Когда релиз?', body: 'Завтра' }, { body: 'Просто ответ' }])
  assert.deepEqual(calls.map(call => bodyOf(call).body), ['> Когда релиз?\n\nЗавтра', 'Просто ответ'])
})

test('U28: некорректный threadId отклоняется до первой отправки', async () => {
  const { instance, calls } = provider({ [THREAD_POST]: ok('{}') })
  await assert.rejects(instance.publishReplies(42, [{ threadId: '11:src/a.ts:7', body: 'ок' }, { threadId: 'bad', body: 'нет' }]), /неизвестный тред bad/)
  assert.equal(calls.length, 0)
})

test('U29: сбой на втором ответе сообщает, сколько уже отправлено', async () => {
  const { instance, calls } = provider({ [ISSUE_POST]: [ok('{}'), failure(500, 'boom'), ok('{}')] })
  await assert.rejects(instance.publishReplies(42, [{ body: 'раз' }, { body: 'два' }, { body: 'три' }]), /HTTP 500.*уже отправлено 1 из 3/)
  assert.equal(calls.length, 2)
  const unknown = provider({ [ISSUE_POST]: [ok('{}'), new Error('net'), ok('{}')] })
  await assert.rejects(unknown.instance.publishReplies(42, [{ body: 'раз' }, { body: 'два' }, { body: 'три' }]), (error: Error) => {
    assert.ok(error instanceof PublishUnknownError)
    assert.match(error.message, /статус публикации неизвестен.*PR 42/)
    assert.match(error.message, /уже отправлено 1 из 3/)
    return true
  })
  assert.equal(unknown.calls.length, 2)
})
