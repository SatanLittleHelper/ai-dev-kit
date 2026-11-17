import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createForgejo } from '../src/provider.mts'
import { API, TOKEN, failure, fixture, list, ok, provider } from './helpers.mts'

const REVIEW = (id: number) => ({ id, user: { login: 'alice' }, state: 'COMMENT', body: '', commit_id: 'c', submitted_at: '2026-10-01T10:00:00Z' })

test('U6: запрос идёт на /api/v1 хоста с токеном в заголовке', async () => {
  const { instance, calls } = provider({ [`GET ${API}/pulls/42`]: ok(fixture('pull.json')) })
  await instance.getPull(42)
  assert.equal(calls[0].url, 'https://git.example.org/api/v1/repos/team/app/pulls/42')
  assert.equal(calls[0].init?.headers?.Authorization, `token ${TOKEN}`)
  assert.equal(calls[0].init?.headers?.Accept, 'application/json')
})

test('U7: ответ с HTTP-ошибкой превращается в ошибку со статусом', async () => {
  const { instance } = provider({ [`GET ${API}/pulls/42`]: failure(404, 'x'.repeat(600)) })
  await assert.rejects(instance.getPull(42), (error: Error & { status?: number }) => {
    assert.match(error.message, /GET \/repos\/team\/app\/pulls\/42: HTTP 404/)
    assert.ok(!error.message.includes('x'.repeat(501)))
    assert.equal(error.status, 404)
    return true
  })
})

test('U8: сетевой сбой — ошибка без статуса', async () => {
  const { instance } = provider({ [`GET ${API}/pulls/42`]: new Error('boom') })
  await assert.rejects(instance.getPull(42), (error: Error & { status?: number }) => {
    assert.match(error.message, /сеть/)
    assert.equal(error.status, undefined)
    return true
  })
})

test('U9: читает все страницы списка по x-total-count', async () => {
  const { instance, calls } = provider({
    [`GET ${API}/pulls/42/reviews?page=1&limit=50`]: list(JSON.stringify([REVIEW(1), REVIEW(2)]), 3),
    [`GET ${API}/pulls/42/reviews?page=2&limit=50`]: list(JSON.stringify([REVIEW(3)]), 3),
  })
  assert.equal((await instance.listReviews(42)).length, 3)
  assert.equal(calls.length, 2)
})

test('U10: останавливается на пустой странице, если заголовка нет', async () => {
  const { instance, calls } = provider({
    [`GET ${API}/pulls/42/reviews?page=1&limit=50`]: ok(JSON.stringify([REVIEW(1)])),
    [`GET ${API}/pulls/42/reviews?page=2&limit=50`]: ok('[]'),
  })
  assert.equal((await instance.listReviews(42)).length, 1)
  assert.equal(calls.length, 2)
})

test('U11: запрос без ответа дольше таймаута завершается ошибкой', async () => {
  const instance = createForgejo({
    repo: { host: 'git.example.org', owner: 'team', repo: 'app' }, token: TOKEN, http: () => new Promise(() => {}), sleep: async () => {}, timeoutMs: 30_000,
  })
  await assert.rejects(instance.getPull(42), /нет ответа за 30 с/)
})

test('U12: токен не попадает в сообщения ошибок', async () => {
  const server = provider({ [`GET ${API}/pulls/42`]: failure(500, 'echo SECRET') }, 'SECRET')
  await assert.rejects(server.instance.getPull(42), (error: Error) => !error.message.includes('SECRET'))
  const network = provider({ [`GET ${API}/pulls/42`]: new Error('connect failed with token SECRET') }, 'SECRET')
  await assert.rejects(network.instance.getPull(42), (error: Error) => !error.message.includes('SECRET'))
})
