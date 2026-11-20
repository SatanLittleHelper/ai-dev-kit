import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pullRows } from '../src/status.mts'
import { fakeProvider } from './fake.mts'
import { comment, pull, review, thread } from './helpers.mts'

test('U44: строки дашборда: действия — первыми, свои — выше чужих, затем по номеру', async () => {
  const provider = fakeProvider({
    me: 'me',
    pulls: [pull({ number: 1 }), pull({ number: 2 }), pull({ number: 3, author: 'me' }), pull({ number: 4, author: 'me' }), pull({ number: 5 })],
    reviews: { 2: [review()] },
    threads: { 3: { threads: [thread({ comments: [comment()] })], general: [] } },
  })
  const { rows } = await pullRows(provider)
  assert.deepEqual(rows.map(row => row.number), [3, 1, 5, 2, 4])
})

test('U45: при 50 открытых PR выставляется признак усечения', async () => {
  const many = (count: number) => fakeProvider({ me: 'me', pulls: Array.from({ length: count }, (_, index) => pull({ number: index + 1 })) })
  assert.equal((await pullRows(many(50))).truncated, true)
  assert.equal((await pullRows(many(49))).truncated, false)
})

test('U62: строка дашборда несёт состояние CI и упавшие проверки; упавший CI на своём PR — в «требует действия»', async () => {
  const failed = { state: 'failure' as const, failed: ['[CI] build and test / check (pull_request)'] }
  const provider = fakeProvider({ me: 'me', pulls: [pull({ number: 1, author: 'me', headSha: 'a' }), pull({ number: 2, author: 'me', headSha: 'b' })], ci: { a: failed, b: { state: 'success', failed: [] } } })
  const { rows } = await pullRows(provider)
  assert.deepEqual(rows.map(row => [row.number, row.scenario, row.ci, row.failedChecks]), [[1, 'ci-failed', 'failure', failed.failed], [2, 'none-own', 'success', []]])
})

test('U64: строка дашборда несёт ссылку на PR и возраст последней активности', async () => {
  const now = Date.parse('2026-10-03T12:00:00Z')
  const provider = fakeProvider({ me: 'me', pulls: [
    pull({ number: 1, url: 'https://git.example.org/team/app/pulls/1', updatedAt: '2026-10-03T11:55:00Z' }),
    pull({ number: 2, updatedAt: '2026-10-03T09:00:00Z' }),
    pull({ number: 3, updatedAt: '2026-10-01T12:00:00Z' }),
    pull({ number: 4, updatedAt: '' }),
  ] })
  const { rows } = await pullRows(provider, now)
  const by = (n: number) => rows.find(row => row.number === n)
  assert.equal(by(1)?.url, 'https://git.example.org/team/app/pulls/1')
  assert.deepEqual([1, 2, 3, 4].map(n => by(n)?.activity), ['5 мин', '3 ч', '2 дн', ''])
})
