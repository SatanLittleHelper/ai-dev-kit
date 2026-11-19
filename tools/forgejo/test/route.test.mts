import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionOf, pullRows, routeOf, scenarioOf, stackParentOf, statusOf } from '../src/status.mts'
import type { PrData } from '../src/status.mts'
import { fakeProvider } from './fake.mts'
import { pull, review, comment, data, thread } from './helpers.mts'

test('U65: approvals — последнее ревью каждого ревьюера, без dismissed и без автора', async () => {
  const provider = fakeProvider({ me: 'me', pulls: [pull({ number: 1 })], reviews: { 1: [
    review({ id: 'a', author: 'dave', submittedAt: '2026-10-01T10:00:00Z' }),
    review({ id: 'b', author: 'dave', submittedAt: '2026-10-02T10:00:00Z' }),
    review({ id: 'c', author: 'erin', dismissed: true }),
    review({ id: 'd', author: 'frank' }),
    review({ id: 'e', author: 'bob' }),
    review({ id: 'f', author: 'gina', submittedAt: '2026-10-01T10:00:00Z' }),
    review({ id: 'g', author: 'gina', state: 'changes', submittedAt: '2026-10-02T10:00:00Z' }),
  ] } })
  const { rows } = await pullRows(provider)
  assert.equal(rows[0].approvals, 2)
})

test('U66: stackParentOf — открытый PR, чья head-ветка равна base; fork main→main не родитель', () => {
  const parent = pull({ number: 1, headRef: 'feature-a', baseRef: 'main' })
  const child = pull({ number: 2, headRef: 'feature-b', baseRef: 'feature-a' })
  const fork = pull({ number: 3, headRef: 'main', baseRef: 'main' })
  const closed = pull({ number: 4, headRef: 'feature-c', baseRef: 'main', state: 'closed' })
  const orphan = pull({ number: 5, headRef: 'feature-d', baseRef: 'feature-c' })
  const all = [parent, child, fork, closed, orphan]
  assert.equal(stackParentOf(child, all), 1)
  assert.equal(stackParentOf(parent, all), null)
  assert.equal(stackParentOf(orphan, all), null)
})

test('U67: готовые к слиянию идут первыми в порядке стека; родитель выше ребёнка, даже с большим номером', async () => {
  const provider = fakeProvider({
    me: 'me',
    pulls: [
      pull({ number: 9, headRef: 'a', baseRef: 'main' }),
      pull({ number: 2, headRef: 'b', baseRef: 'a' }),
      pull({ number: 5, headRef: 'c', baseRef: 'main' }),
      pull({ number: 1, headRef: 'd', baseRef: 'main' }),
    ],
    reviews: { 9: [review()], 2: [review()], 5: [review()] },
  })
  const { rows } = await pullRows(provider)
  assert.deepEqual(rows.map(row => row.number), [1, 5, 9, 2])
  const by = (n: number) => rows.find(row => row.number === n)
  assert.deepEqual([9, 2, 5].map(n => [n, by(n)?.baseRef, by(n)?.stackParent, by(n)?.approvals]), [
    [9, 'main', null, 1],
    [2, 'a', 9, 1],
    [5, 'main', null, 1],
  ])
})

const act = (prData: PrData, stackParent: number | null) => {
  const scenario = scenarioOf(prData)
  return actionOf(scenario, statusOf(prData, scenario), prData.pull.author === prData.me, stackParent)
}

test('U68: actionOf по таблице состояний', () => {
  const own = { pull: pull({ author: 'me' }) }
  assert.equal(act(data({ reviews: [review()] }), null), 'merge')
  assert.equal(act(data({ reviews: [review()] }), 7), 'merge-blocked')
  assert.equal(act(data({}), null), 'open-review')
  assert.equal(act(data({ reviews: [review({ state: 'changes', commitSha: 'h1' })] }), null), 'open-review')
  assert.equal(act(data({ ...own, threads: [thread({ comments: [comment()] })] }), null), 'triage')
  assert.equal(act(data({ pull: pull({ author: 'me', conflicted: true }) }), null), 'triage')
  assert.equal(act(data({ ...own, ci: { state: 'failure', failed: ['build'] } }), null), 'triage')
  assert.equal(act(data(own), null), 'overview')
  assert.equal(act(data({ ...own, reviews: [review({ author: 'dave' })] }), null), 'merge')
  assert.equal(act(data({ reviews: [review()], threads: [thread({ comments: [comment()] })] }), null), 'overview')
  assert.equal(act(data({ pull: pull({ state: 'closed' }) }), null), 'overview')
})

test('U77: конфликтный PR и PR только с самоодобрением автора не «готовы к слиянию»', () => {
  assert.equal(act(data({ pull: pull({ conflicted: true }), reviews: [review()] }), null), 'overview')
  assert.equal(act(data({ reviews: [review({ author: 'bob' })] }), null), 'open-review')
})

test('U69: routeOf собирает действие, ветку и родителя стека', async () => {
  const provider = fakeProvider({
    me: 'me',
    pulls: [pull({ number: 1, headRef: 'a' }), pull({ number: 2, headRef: 'b', baseRef: 'a', url: 'https://git.example.org/team/app/pulls/2' })],
    reviews: { 2: [review()] },
  })
  assert.deepEqual(await routeOf(provider, 2), {
    number: 2, url: 'https://git.example.org/team/app/pulls/2', isOwn: false, scenario: 'wait-author', status: 'готов к слиянию',
    ci: 'none', baseRef: 'a', headSha: 'h2', stackParent: 1, action: 'merge-blocked',
  })
})
