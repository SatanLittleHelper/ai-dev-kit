import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run } from '../cli/run.mts'
import { PublishUnknownError } from '../src/types.mts'
import { fakeProvider } from './fake.mts'
import type { FakeData } from './fake.mts'
import { comment, pull, review, thread } from './helpers.mts'

const DRAFT = { verdict: 'request-changes', body: 'Итог', comments: [{ path: 'src/a.ts', line: 5, body: 'Тут null' }] }
const REPLIES = [{ threadId: '11:src/a.ts:7', body: 'Исправил' }, { body: 'Общий', quote: 'Когда?' }]

function harness(data: Partial<FakeData> = {}, files: Record<string, string> = {}, env: Record<string, string> = { FORGEJO_TOKEN: 'SECRET' }) {
  const fake = fakeProvider({ me: 'me', pulls: [pull({ number: 42 })], ...data })
  const out: string[] = []
  const err: string[] = []
  const created = { count: 0 }
  const io = {
    env: (name: string) => env[name],
    remoteUrl: () => 'git@git.example.org:team/app.git',
    readFile: (path: string) => {
      if (!(path in files)) throw new Error(`ENOENT ${path}`)
      return files[path]
    },
    out: (text: string) => { out.push(text) },
    err: (text: string) => { err.push(text) },
    createProvider: () => {
      created.count++
      return fake
    },
  }
  const exec = (...argv: string[]) => run(argv, io)
  return { fake, out, err, created, exec }
}

test('U49: команды чтения печатают JSON в stdout и завершаются кодом 0', async () => {
  const h = harness({ pulls: [pull({ number: 42 }), pull({ number: 7, state: 'closed' })] })
  const json = async (...argv: string[]) => {
    h.out.length = 0
    assert.equal(await h.exec(...argv), 0)
    return JSON.parse(h.out.join('\n'))
  }
  assert.deepEqual((await json('pr', 'list')).map((item: { number: number }) => item.number), [42])
  assert.deepEqual((await json('pr', 'list', '--state', 'closed')).map((item: { number: number }) => item.number), [7])
  assert.equal((await json('pr', 'get', '42')).pullRef, 'refs/pull/42/head')
  assert.deepEqual(await json('pr', 'reviews', '42'), [])
  assert.deepEqual(await json('pr', 'threads', '42'), { threads: [], general: [] })
  assert.deepEqual(await json('whoami'), { login: 'me' })
  assert.deepEqual(h.err, [])
})

test('U50: pr dashboard группирует PR на «требует действия» и «ждёт других»', async () => {
  const h = harness({ pulls: [pull({ number: 1 }), pull({ number: 2 })], reviews: { 2: [review()] } })
  assert.equal(await h.exec('pr', 'dashboard'), 0)
  const result = JSON.parse(h.out.join('\n'))
  assert.deepEqual([result.due.map((row: { number: number }) => row.number), result.waiting.map((row: { number: number }) => row.number), result.truncated], [[1], [2], false])
})

test('U51: pr feedback N печатает замечания; без замечаний — пустой список', async () => {
  const withThread = thread({ id: '11:src/a.ts:5', comments: [comment({ reviewId: '11', path: 'src/a.ts', line: 5, commitSha: 'h2' })] })
  const h = harness({ pulls: [pull({ number: 42, author: 'me' }), pull({ number: 43, author: 'me' })], threads: { 42: { threads: [withThread], general: [] } } })
  assert.equal(await h.exec('pr', 'feedback', '42'), 0)
  const [item] = JSON.parse(h.out.join('\n'))
  assert.deepEqual([item.path, item.position, item.author, item.stale, item.disagree], ['src/a.ts', 5, 'alice', false, false])
  h.out.length = 0
  assert.equal(await h.exec('pr', 'feedback', '43'), 0)
  assert.deepEqual(JSON.parse(h.out.join('\n')), [])
})

test('U52: pr review без --confirm — dry-run, ничего не публикует', async () => {
  const h = harness({}, { 'draft.json': JSON.stringify(DRAFT) })
  assert.equal(await h.exec('pr', 'review', '42', '--file', 'draft.json'), 0)
  assert.deepEqual(JSON.parse(h.out.join('\n')).payload, DRAFT)
  assert.equal(JSON.parse(h.out.join('\n')).dryRun, true)
  assert.equal(h.fake.published.length, 0)
})

test('U53: pr review --confirm публикует и печатает url', async () => {
  const h = harness({}, { 'draft.json': JSON.stringify(DRAFT) })
  assert.equal(await h.exec('pr', 'review', '42', '--file', 'draft.json', '--confirm'), 0)
  assert.deepEqual(h.fake.published, [{ number: 42, draft: DRAFT }])
  assert.equal(JSON.parse(h.out.join('\n')).url, 'fake://42/review/1')
})

test('U54: невалидный черновик ревью отклоняется кодом 2 до публикации', async () => {
  const cases: Array<[string, string]> = [
    [JSON.stringify({ ...DRAFT, verdict: 'merge' }), 'verdict'],
    [JSON.stringify({ ...DRAFT, comments: [{ line: 5, body: 'x' }] }), 'path'],
    [JSON.stringify({ ...DRAFT, comments: [{ path: 'a.ts', line: '5', body: 'x' }] }), 'line'],
    ['не json', 'не JSON'],
  ]
  for (const [text, fragment] of cases) {
    for (const flags of [[], ['--confirm']]) {
      const h = harness({}, { 'draft.json': text })
      assert.equal(await h.exec('pr', 'review', '42', '--file', 'draft.json', ...flags), 2)
      assert.ok(h.err.join('\n').includes(fragment), `${fragment}: ${h.err.join('\n')}`)
      assert.equal(h.fake.published.length, 0)
    }
  }
})

test('U55: pr reply без --confirm — dry-run, с --confirm — публикация', async () => {
  const h = harness({}, { 'replies.json': JSON.stringify(REPLIES) })
  assert.equal(await h.exec('pr', 'reply', '42', '--file', 'replies.json'), 0)
  assert.equal(JSON.parse(h.out.join('\n')).dryRun, true)
  assert.equal(h.fake.replied.length, 0)
  assert.equal(await h.exec('pr', 'reply', '42', '--file', 'replies.json', '--confirm'), 0)
  assert.deepEqual(h.fake.replied, [{ number: 42, replies: REPLIES }])
})

test('U56: невалидный файл ответов отклоняется кодом 2', async () => {
  const cases: Array<[string, string]> = [['{"body":"x"}', 'массив'], ['[]', 'массив'], ['[{"threadId":"11:a.ts:1"}]', 'body']]
  for (const [text, fragment] of cases) {
    for (const flags of [[], ['--confirm']]) {
      const h = harness({}, { 'replies.json': text })
      assert.equal(await h.exec('pr', 'reply', '42', '--file', 'replies.json', ...flags), 2)
      assert.ok(h.err.join('\n').includes(fragment), `${fragment}: ${h.err.join('\n')}`)
      assert.equal(h.fake.replied.length, 0)
    }
  }
})

test('U57: неизвестная команда и отсутствие номера или --file — код 2 с подсказкой', async () => {
  for (const argv of [[], ['pr', 'unknown'], ['pr', 'get'], ['pr', 'review', '42']]) {
    const h = harness()
    assert.equal(await h.exec(...argv), 2, argv.join(' '))
    assert.ok(h.err.join('\n').includes('Использование'))
  }
})

test('U58: неизвестный статус публикации — код 3', async () => {
  const h = harness({ publishReviewError: new PublishUnknownError('POST: сеть; статус публикации неизвестен — проверьте PR 42 перед повтором') }, { 'draft.json': JSON.stringify(DRAFT) })
  assert.equal(await h.exec('pr', 'review', '42', '--file', 'draft.json', '--confirm'), 3)
  assert.match(h.err.join('\n'), /статус публикации неизвестен/)
  const replies = harness({ publishRepliesError: new PublishUnknownError('статус публикации неизвестен — проверьте PR 42') }, { 'replies.json': JSON.stringify(REPLIES) })
  assert.equal(await replies.exec('pr', 'reply', '42', '--file', 'replies.json', '--confirm'), 3)
  assert.match(replies.err.join('\n'), /статус публикации неизвестен/)
})

test('U59: остальные ошибки — код 1; токен не попадает в вывод', async () => {
  const h = harness({ publishReviewError: new Error('HTTP 500 echo SECRET') }, { 'draft.json': JSON.stringify(DRAFT) })
  assert.equal(await h.exec('pr', 'review', '42', '--file', 'draft.json', '--confirm'), 1)
  assert.ok(!`${h.out.join('')}${h.err.join('')}`.includes('SECRET'))
})

test('U60: токен не принимается флагом', async () => {
  const h = harness({}, {}, {})
  assert.equal(await h.exec('pr', 'list', '--token', 'X'), 2)
  assert.match(h.err.join('\n'), /неизвестный флаг --token/)
  assert.equal(h.created.count, 0)
})

test('U63: pr files печатает список файлов PR', async () => {
  const h = harness({ files: { 42: ['docs/a/roadmap-state.json'] } })
  assert.equal(await h.exec('pr', 'files', '42'), 0)
  assert.deepEqual(JSON.parse(h.out.join('\n')), ['docs/a/roadmap-state.json'])
})

test('U70: pr route печатает действие для PR', async () => {
  const h = harness({ pulls: [pull({ number: 42 })], reviews: { 42: [review()] } })
  assert.equal(await h.exec('pr', 'route', '42'), 0)
  const result = JSON.parse(h.out.join('\n'))
  assert.deepEqual([result.action, result.baseRef, result.stackParent], ['merge', 'main', null])
})

test('U73: pr merge без --confirm — dry-run, ничего не вливает', async () => {
  const h = harness({ pulls: [pull({ number: 42 })], reviews: { 42: [review()] } })
  assert.equal(await h.exec('pr', 'merge', '42'), 0)
  assert.deepEqual(JSON.parse(h.out.join('\n')), { dryRun: true, action: 'merge', pull: 42, base: 'main', method: 'merge', ci: 'none' })
  assert.deepEqual(h.fake.merged, [])
})

test('U74: pr merge --confirm --method squash вливает PR', async () => {
  const h = harness({ pulls: [pull({ number: 42 })], reviews: { 42: [review()] } })
  assert.equal(await h.exec('pr', 'merge', '42', '--method', 'squash', '--confirm'), 0)
  assert.deepEqual(h.fake.merged, [{ number: 42, method: 'squash', headSha: 'h2' }])
  assert.deepEqual(JSON.parse(h.out.join('\n')), { merged: true, pull: 42, method: 'squash' })
})

test('U75: pr merge отказывает, если PR сейчас нельзя влить', async () => {
  const notReady = harness({ pulls: [pull({ number: 42 })] })
  assert.equal(await notReady.exec('pr', 'merge', '42', '--confirm'), 1)
  assert.match(notReady.err.join('\n'), /нельзя влить/)
  const stacked = harness({ pulls: [pull({ number: 41, headRef: 'a' }), pull({ number: 42, headRef: 'b', baseRef: 'a' })], reviews: { 42: [review()] } })
  assert.equal(await stacked.exec('pr', 'merge', '42', '--confirm'), 1)
  assert.match(stacked.err.join('\n'), /сначала влейте #41/)
  assert.deepEqual([...notReady.fake.merged, ...stacked.fake.merged], [])
})

test('U76: pr merge с неизвестным --method — код 2', async () => {
  const h = harness({ pulls: [pull({ number: 42 })], reviews: { 42: [review()] } })
  assert.equal(await h.exec('pr', 'merge', '42', '--method', 'fast', '--confirm'), 2)
  assert.deepEqual(h.fake.merged, [])
})
