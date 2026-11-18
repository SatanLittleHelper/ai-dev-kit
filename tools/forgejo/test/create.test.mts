import assert from 'node:assert/strict'
import { test } from 'node:test'
import { run } from '../cli/run.mts'
import { createForgejo } from '../src/provider.mts'
import type { Http, HttpResponse, PullDraft } from '../src/types.mts'

const draft = { base: 'main', head: 'topic', title: 'Change', body: 'Первый абзац\n\nВторой абзац\n' }
const created = { number: 12, html_url: 'https://git.example.org/team/app/pulls/12' }
const ok = (body: unknown, headers = {}): HttpResponse => ({ status: 200, ok: true, headers, text: JSON.stringify(body) })
const failure = (status: number): HttpResponse => ({ status, ok: false, headers: {}, text: 'service echoed PRIVATE_TOKEN' })

function harness(responses: (HttpResponse | Error)[], input: unknown = draft, beforeCreate?: (draft: PullDraft) => void) {
  const out: string[] = [], err: string[] = []
  const calls: { path: string; method?: string; body?: string }[] = []
  const http: Http = async (url, init) => {
    calls.push({ path: url, method: init?.method, body: init?.body })
    const next = responses.shift()
    if (!next || next instanceof Error) throw next ?? new Error('unexpected request')
    return next
  }
  const cli = (...args: string[]) => run(args, {
    out: text => out.push(text), err: text => err.push(text),
    env: name => name === 'GITEA_TOKEN' ? 'PRIVATE_TOKEN' : undefined,
    remoteUrl: () => 'git@git.example.org:team/app.git',
    readFile: () => JSON.stringify(input),
    createProvider: config => createForgejo({ ...config, http, sleep: async () => {} }),
    beforeCreate,
  })
  return { cli, calls, out, err }
}

test('поиск проверяет следующую страницу и пропускает ветку форка', async () => {
  const row = (repo: string, number: number) => ({
    ...created, number, title: 'T', user: { login: 'sam' }, state: 'open',
    head: { ref: 'topic', sha: 'abc', repo: { full_name: repo } }, base: { ref: 'main' },
  })
  const h = harness([ok([row('fork/app', 1)]), ok([row('Team/App', 12)], { 'x-total-count': '2' })])
  assert.equal(await h.cli('pr', 'find', '--head', 'topic'), 0)
  assert.equal(JSON.parse(h.out[0]).number, 12)
  assert.deepEqual(h.calls.map(call => [call.method, new URL(call.path).searchParams.get('page')]), [['GET', '1'], ['GET', '2']])
})

test('поиск различает отсутствие PR, неизвестный репозиторий head и HTTP-ошибку', async () => {
  const noPr = harness([ok([])])
  assert.equal(await noPr.cli('pr', 'find', '--head', 'topic'), 0)
  assert.equal(noPr.out[0], 'null')
  const unknown = harness([ok([{ head: { ref: 'topic' } }]), ok([])])
  assert.equal(await unknown.cli('pr', 'find', '--head', 'topic'), 1)
  assert.deepEqual(unknown.out, [])
  const failed = harness([failure(403)])
  assert.equal(await failed.cli('pr', 'find', '--head', 'topic'), 1)
  assert.deepEqual(failed.out, [])
})

test('create без подтверждения валидирует ввод и не обращается к HTTP', async () => {
  const preview = harness([])
  assert.equal(await preview.cli('pr', 'create', '--file', 'draft.json'), 0)
  assert.deepEqual(JSON.parse(preview.out[0]), { dryRun: true, action: 'create', payload: draft })
  assert.deepEqual(preview.calls, [])
  const invalid = harness([], { ...draft, title: ' ' })
  assert.equal(await invalid.cli('pr', 'create', '--file', 'draft.json', '--confirm'), 2)
  assert.deepEqual(invalid.calls, [])
})

test('create передаёт один проверенный черновик и возвращает номер и URL', async () => {
  let checked: PullDraft | undefined
  const h = harness([ok(created)], { ...draft, extra: true }, parsed => { checked = parsed })
  assert.equal(await h.cli('pr', 'create', '--file', 'draft.json', '--confirm'), 0)
  assert.deepEqual(h.calls, [{
    path: 'https://git.example.org/api/v1/repos/team/app/pulls', method: 'POST', body: JSON.stringify(checked),
  }])
  assert.deepEqual(checked, draft)
  assert.deepEqual(JSON.parse(h.out[0]), { number: 12, url: created.html_url })

  const rejected = harness([], draft, () => { throw new Error('не прошёл проверку') })
  assert.equal(await rejected.cli('pr', 'create', '--file', 'draft.json', '--confirm'), 1)
  assert.match(rejected.err[0], /не прошёл проверку/)
  assert.deepEqual(rejected.calls, [])
})

test('create различает отказ и неопределённую запись, скрывает токен и не повторяет POST', async () => {
  for (const [reply, code] of [
    [failure(422), 1], [failure(503), 3], [failure(408), 3],
    [new Error('echo PRIVATE_TOKEN'), 3], [ok(null), 3], [ok({ number: 12 }), 3],
    [{ ...ok(null), text: '<html>' }, 3],
  ] as const) {
    const h = harness([reply])
    assert.equal(await h.cli('pr', 'create', '--file', 'draft.json', '--confirm'), code)
    assert.equal(h.calls.length, 1)
    assert.equal(h.calls[0].method, 'POST')
    assert.deepEqual(h.out, [])
    assert.doesNotMatch(h.err[0], /PRIVATE_TOKEN/)
    if (code === 3) assert.match(h.err[0], /pr find/)
  }
})
