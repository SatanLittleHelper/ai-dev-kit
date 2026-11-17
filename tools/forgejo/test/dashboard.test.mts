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
  assert.deepEqual(rows.map(row => row.number), [3, 1, 5, 4, 2])
})

test('U45: при 50 открытых PR выставляется признак усечения', async () => {
  const many = (count: number) => fakeProvider({ me: 'me', pulls: Array.from({ length: count }, (_, index) => pull({ number: index + 1 })) })
  assert.equal((await pullRows(many(50))).truncated, true)
  assert.equal((await pullRows(many(49))).truncated, false)
})
