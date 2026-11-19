import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PublishUnknownError } from '../src/types.mts'
import { API, failure, ok, provider } from './helpers.mts'

const KEY = `POST ${API}/pulls/42/merge`

test('U71: mergePull шлёт POST /merge с Do', async () => {
  const { instance, calls } = provider({ [KEY]: ok('') })
  await instance.mergePull(42, 'squash', 'abc123')
  assert.equal(calls[0].init?.body, JSON.stringify({ Do: 'squash', head_commit_id: 'abc123' }))
})

test('U72: отказ сервера (4xx) пробрасывается, 5xx и сбой сети — статус слияния неизвестен', async () => {
  await assert.rejects(provider({ [KEY]: failure(405, 'not mergeable') }).instance.mergePull(42, 'merge', 'abc123'), error => !(error instanceof PublishUnknownError) && /HTTP 405/.test((error as Error).message))
  await assert.rejects(provider({ [KEY]: failure(500) }).instance.mergePull(42, 'merge', 'abc123'), PublishUnknownError)
  await assert.rejects(provider({ [KEY]: new Error('boom') }).instance.mergePull(42, 'merge', 'abc123'), PublishUnknownError)
})
