import { test } from 'node:test'
import assert from 'node:assert/strict'
import { API, READ_ROUTES, USER_KEY, failure, fixture, list, ok, provider, REVIEWS_KEY } from './helpers.mts'

test('U13: getPull отдаёт PR в доменной модели', async () => {
  const { instance } = provider({ [`GET ${API}/pulls/42`]: ok(fixture('pull.json')) })
  assert.deepEqual(await instance.getPull(42), {
    number: 42, title: 'Добавить экспорт', body: 'Экспорт в CSV', author: 'Bob', headRef: 'feature/export', headSha: 'aaa111', baseRef: 'main',
    state: 'open', merged: false, url: 'https://git.example.org/team/app/pulls/42', conflicted: false, updatedAt: '2026-10-02T08:30:00Z',
  })
})

test('U14: конфликт определяется только у открытого и невлитого PR', async () => {
  const raw = JSON.parse(fixture('pull.json')) as Record<string, unknown>
  const conflicted = async (over: Record<string, unknown>) => {
    const { instance } = provider({ [`GET ${API}/pulls/42`]: ok(JSON.stringify({ ...raw, ...over })) })
    return (await instance.getPull(42)).conflicted
  }
  assert.equal(await conflicted({ mergeable: false }), true)
  assert.equal(await conflicted({ mergeable: true }), false)
  assert.equal(await conflicted({ mergeable: false, state: 'closed' }), false)
  assert.equal(await conflicted({ mergeable: false, merged: true }), false)
})

test('U15: listPulls передаёт состояние и возвращает PR', async () => {
  const raw = JSON.parse(fixture('pull.json')) as Record<string, unknown>
  const { instance, calls } = provider({ [`GET ${API}/pulls?state=closed&page=1&limit=50`]: ok(JSON.stringify([{ ...raw, number: 7, state: 'closed' }, { ...raw, number: 8, state: 'closed' }])) })
  const pulls = await instance.listPulls('closed')
  assert.deepEqual(pulls.map(item => item.number), [7, 8])
  assert.equal(calls.length, 1)
})

test('U16: currentUser кэшируется, а неудача не кэшируется', async () => {
  const { instance } = provider({ [USER_KEY]: [failure(500), ok('{"login":"me"}')] })
  await assert.rejects(instance.currentUser(), /HTTP 500/)
  assert.equal(await instance.currentUser(), 'me')
  assert.equal(await instance.currentUser(), 'me')
})

test('U17: listReviews отбрасывает ревью неизвестного состояния', async () => {
  const { instance } = provider(READ_ROUTES)
  const reviews = await instance.listReviews(42)
  assert.deepEqual(reviews.map(item => [item.id, item.state, item.dismissed]), [['11', 'changes', false], ['12', 'approved', true], ['13', 'pending', false], ['15', 'comment', false]])
})

test('U18: listThreads группирует комментарии по месту и сортирует по времени', async () => {
  const { instance } = provider(READ_ROUTES)
  const { threads } = await instance.listThreads(42)
  assert.deepEqual(threads.map(item => item.id), ['11:src/a.ts:5', '11:src/b.ts:9'])
  assert.deepEqual(threads[0].comments.map(item => item.id), ['100', '101'])
  const comments = JSON.parse(fixture('review-comments-11.json'))
  const repeated = provider({
    ...READ_ROUTES,
    [`GET ${API}/pulls/42/reviews/12/comments`]: ok(JSON.stringify([{ ...comments[2], id: 103, pull_request_review_id: 12, resolver: null }])),
  })
  const separated = (await repeated.instance.listThreads(42)).threads
  assert.deepEqual(separated.map(item => [item.id, item.resolved]), [
    ['11:src/a.ts:5', false], ['11:src/b.ts:9', true], ['12:src/b.ts:9', false],
  ])
})

test('U19: тред считается решённым, если у комментария есть resolver', async () => {
  const { instance } = provider(READ_ROUTES)
  const { threads } = await instance.listThreads(42)
  assert.deepEqual(threads.map(item => item.resolved), [false, true])
})

test('U20: listThreads не запрашивает комментарии ревью неизвестного состояния и отдаёт общие комментарии', async () => {
  const { instance, calls } = provider(READ_ROUTES)
  const { general } = await instance.listThreads(42)
  assert.ok(!calls.some(call => call.url.includes('/reviews/14/comments')))
  assert.deepEqual(general, [{ id: '200', author: 'carol', body: 'Когда релиз?', createdAt: '2026-10-02T09:00:00Z' }])
})

void list
void REVIEWS_KEY

test('U19: listPullFiles отдаёт пути файлов PR и проходит все страницы', async () => {
  const { instance } = provider({
    [`GET ${API}/pulls/42/files?page=1&limit=50`]: ok(JSON.stringify([{ filename: 'docs/a/roadmap-state.json' }, { filename: 'src/x.ts' }]), { 'x-total-count': '2' }),
  })
  assert.deepEqual(await instance.listPullFiles(42), ['docs/a/roadmap-state.json', 'src/x.ts'])
})
