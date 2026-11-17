import { test } from 'node:test'
import assert from 'node:assert/strict'
import { intakeItems, scenarioOf, statusOf } from '../src/status.mts'
import { comment, data, pull, review, thread } from './helpers.mts'

const verdict = (over: Parameters<typeof data>[0]) => {
  const prData = data(over)
  const scenario = scenarioOf(prData)
  return [scenario, statusOf(prData, scenario)]
}
const mine = (over = {}) => comment({ author: 'me', ...over })

test('U30: чужой PR без моего ревью — «на проверке»', () => {
  assert.deepEqual(verdict({}), ['review', 'на проверке'])
})

test('U31: чужой PR с моим approve без отклонения — «ждём автора»', () => {
  assert.deepEqual(verdict({ reviews: [review()], threads: [thread({ comments: [mine()] })] }), ['wait-author', 'ждём автора'])
})

test('U32: моё ревью на старом коммите — «перепроверка»', () => {
  assert.deepEqual(verdict({ reviews: [review({ state: 'changes', commitSha: 'h1' })] }), ['recheck', 'перепроверка'])
})

test('U33: на текущем коммите различает «автор ответил» и «молчит»', () => {
  const reviews = [review({ state: 'changes', commitSha: 'h2' })]
  const authorLast = thread({ comments: [mine(), comment({ id: 'c2', author: 'bob' })] })
  const mineLast = thread({ comments: [comment({ id: 'c3', author: 'bob' }), mine({ id: 'c4' })] })
  assert.equal(verdict({ reviews, threads: [authorLast] })[0], 'recheck')
  assert.equal(verdict({ reviews, threads: [mineLast] })[0], 'wait-author')
})

test('U34: свой PR: замечания, конфликт, либо ничего', () => {
  const own = { pull: pull({ author: 'me' }) }
  assert.deepEqual(verdict({ ...own, threads: [thread({ comments: [comment()] })] }), ['feedback', 'есть замечания'])
  assert.deepEqual(verdict({ pull: pull({ author: 'me', conflicted: true }) }), ['conflict', 'конфликт'])
  assert.deepEqual(verdict(own), ['none-own', 'ждём ревью'])
})

test('U35: закрытый и влитый PR', () => {
  assert.deepEqual(verdict({ pull: pull({ state: 'closed' }) }), ['closed', 'закрыт'])
  assert.deepEqual(verdict({ pull: pull({ state: 'closed', merged: true }) }), ['closed', 'влит'])
})

test('U36: чужой PR: «готов к слиянию» только при approve без запросов изменений и без нерешённых тредов', () => {
  const myApprove = review()
  const later = '2026-10-02T10:00:00Z'
  assert.equal(verdict({ reviews: [myApprove, review({ id: 'r2', author: 'dave', state: 'changes', submittedAt: later })] })[1], 'ждём автора')
  assert.equal(verdict({ reviews: [myApprove], threads: [thread({ comments: [comment()] })] })[1], 'ждём автора')
  assert.equal(verdict({ reviews: [myApprove], threads: [thread({ comments: [comment()], resolved: true })] })[1], 'готов к слиянию')
  assert.equal(verdict({ reviews: [review({ author: 'dave' })] })[1], 'на проверке')
})

test('U37: свой PR без замечаний: «готов к слиянию» при approve другого ревьюера, иначе «ждём ревью»', () => {
  const approve = review({ author: 'dave' })
  assert.equal(verdict({ pull: pull({ author: 'me' }), reviews: [approve] })[1], 'готов к слиянию')
  assert.equal(verdict({ pull: pull({ author: 'me' }) })[1], 'ждём ревью')
  assert.equal(verdict({ pull: pull({ author: 'me', conflicted: true }), reviews: [approve] })[1], 'конфликт')
})

test('U38: черновые (pending) ревью не учитываются', () => {
  const draftComment = comment({ author: 'me', reviewId: 'p1' })
  assert.equal(verdict({ reviews: [review({ id: 'p1', state: 'pending' })], threads: [thread({ comments: [draftComment] })] })[0], 'review')
  const ownDraft = data({ pull: pull({ author: 'me' }), reviews: [review({ id: 'p2', author: 'alice', state: 'pending' })], threads: [thread({ comments: [comment({ reviewId: 'p2' })] })] })
  assert.equal(intakeItems(ownDraft).length, 0)
  assert.notEqual(scenarioOf(ownDraft), 'feedback')
})

const own = (over: Parameters<typeof data>[0] = {}) => data({ pull: pull({ author: 'me' }), ...over })

test('U39: нерешённый тред с последним чужим комментарием — замечание', () => {
  const first = comment({ id: '1', reviewId: '11', path: 'src/a.ts', line: 5, commitSha: 'h2', body: 'Тут null' })
  const items = intakeItems(own({ threads: [thread({ id: '11:src/a.ts:5', comments: [first] })] }))
  assert.equal(items.length, 1)
  assert.deepEqual([items[0].kind, items[0].path, items[0].position, items[0].author, items[0].quote], ['thread', 'src/a.ts', 5, 'alice', 'alice: Тут null'])
})

test('U40: решённый тред и тред с моим последним словом — не замечания', () => {
  const resolved = thread({ comments: [comment()], resolved: true })
  const answered = thread({ id: '11:b.ts:2', comments: [comment({ id: '2' }), mine({ id: '3', createdAt: '2026-10-01T11:00:00Z' })] })
  assert.deepEqual(intakeItems(own({ threads: [resolved, answered] })), [])
})

test('U41: замечание помечается stale, если оставлено не на текущей голове', () => {
  const old = thread({ id: '11:a.ts:1', commitSha: 'h1', comments: [comment({ id: '1', commitSha: 'h1' })] })
  const fresh = thread({ id: '11:b.ts:2', commitSha: 'h2', comments: [comment({ id: '2', commitSha: 'h2' })] })
  const prData = own({ threads: [old, fresh] })
  assert.deepEqual(intakeItems(prData).map(item => item.stale), [true, false])
  assert.equal(scenarioOf(prData), 'feedback')
})

test('U42: disagree выставляется, только если я уже отвечал в этом треде раньше', () => {
  const argued = thread({ id: '11:a.ts:1', comments: [mine({ id: '1' }), comment({ id: '2', createdAt: '2026-10-01T11:00:00Z' })] })
  const plain = thread({ id: '11:b.ts:2', comments: [comment({ id: '3' })] })
  assert.deepEqual(intakeItems(own({ threads: [argued, plain] })).map(item => item.disagree), [true, false])
})

test('U43: общие комментарии и тело ревью учитываются только после моего последнего действия', () => {
  const myWord = thread({ comments: [mine({ createdAt: '2026-10-01T10:00:00Z' })], resolved: true })
  const general = [comment({ id: 'g1', createdAt: '2026-10-01T09:00:00Z' }), comment({ id: 'g2', createdAt: '2026-10-01T11:00:00Z' })]
  const at = (submittedAt: string, over = {}) => review({ author: 'alice', state: 'comment', body: 'текст', submittedAt, ...over })
  const reviews = [
    at('2026-10-01T09:30:00Z', { id: 'rv1' }), at('2026-10-01T11:30:00Z', { id: 'rv2' }),
    at('2026-10-01T12:00:00Z', { id: 'rv3', state: 'approved' }), at('2026-10-01T12:30:00Z', { id: 'rv4', body: '  ' }),
  ]
  assert.deepEqual(intakeItems(own({ threads: [myWord], general, reviews })).map(item => item.id), ['issue/g2', 'review/rv2'])
})
