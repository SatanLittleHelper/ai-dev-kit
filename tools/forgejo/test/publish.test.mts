import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ReviewDraft } from '../src/types.mts'
import { API, REVIEWS_KEY, USER_KEY, failure, list, ok, provider } from './helpers.mts'

const POST_REVIEW = `POST ${API}/pulls/42/reviews`
const DRAFT: ReviewDraft = { verdict: 'request-changes', body: 'Итог', comments: [{ path: 'src/a.ts', line: 5, body: 'Тут null' }, { path: 'src/b.ts', line: 9, body: 'Имя' }] }
const mineReview = (id: number, body: string, login = 'me') => ({ id, user: { login }, state: 'COMMENT', body, commit_id: 'c', submitted_at: '2026-10-05T10:00:00Z', html_url: `https://git.example.org/team/app/pulls/42#review-${id}` })
const bodyOf = (call: { init?: { body?: string } }) => JSON.parse(call.init?.body ?? '{}') as Record<string, unknown>

test('U21: ревью публикуется с событием по вердикту и позициями комментариев', async () => {
  const { instance, calls } = provider({ [REVIEWS_KEY]: list('[]'), [USER_KEY]: ok('{"login":"me"}'), [POST_REVIEW]: ok('{"html_url":"https://x/review-1"}') })
  assert.deepEqual(await instance.publishReview(42, DRAFT), { url: 'https://x/review-1' })
  assert.deepEqual(bodyOf(calls.at(-1) ?? {}), { body: 'Итог', event: 'REQUEST_CHANGES', comments: [{ path: 'src/a.ts', new_position: 5, body: 'Тут null' }, { path: 'src/b.ts', new_position: 9, body: 'Имя' }] })
  for (const [verdict, event] of [['approve', 'APPROVED'], ['comment', 'COMMENT']] as const) {
    const other = provider({ [REVIEWS_KEY]: list('[]'), [USER_KEY]: ok('{"login":"me"}'), [POST_REVIEW]: ok('{}') })
    await other.instance.publishReview(42, { verdict, body: '', comments: [] })
    assert.equal(bodyOf(other.calls.at(-1) ?? {}).event, event)
  }
})

test('U22: HTTP-ошибка публикации пробрасывается без сверки', async () => {
  const { instance, calls, sleeps } = provider({ [REVIEWS_KEY]: list('[]'), [USER_KEY]: ok('{"login":"me"}'), [POST_REVIEW]: failure(422, 'bad') })
  await assert.rejects(instance.publishReview(42, DRAFT), /HTTP 422/)
  assert.equal(calls.length, 3)
  assert.deepEqual(sleeps, [])
})

test('U23: после сетевого сбоя находит своё ревью и не дублирует', async () => {
  const { instance, calls } = provider({
    [REVIEWS_KEY]: [list('[]'), list(JSON.stringify([mineReview(99, 'Итог')]))],
    [USER_KEY]: ok('{"login":"me"}'),
    [POST_REVIEW]: new Error('net'),
  })
  assert.deepEqual(await instance.publishReview(42, DRAFT), { url: 'https://git.example.org/team/app/pulls/42#review-99' })
  assert.equal(calls.filter(call => call.init?.method === 'POST').length, 1)
})

test('U24: сверка ищет только новое ревью автора с тем же телом', async () => {
  const old = mineReview(1, 'Итог')
  const after = list(JSON.stringify([old, mineReview(2, 'Итог', 'dave'), mineReview(3, 'Другое')]))
  const { instance } = provider({
    [REVIEWS_KEY]: [list(JSON.stringify([old])), after, after, after],
    [USER_KEY]: ok('{"login":"me"}'),
    [POST_REVIEW]: new Error('net'),
  })
  await assert.rejects(instance.publishReview(42, DRAFT), /статус публикации неизвестен/)
})

test('U25: если ревью не нашлось за 3 попытки, ошибка «статус неизвестен»', async () => {
  const same = list('[]')
  const { instance, sleeps } = provider({ [REVIEWS_KEY]: [same, same, same, same], [USER_KEY]: ok('{"login":"me"}'), [POST_REVIEW]: new Error('net') })
  await assert.rejects(instance.publishReview(42, DRAFT), /статус публикации неизвестен.*PR 42/)
  assert.equal(sleeps.length, 2)
  const root = mkdtempSync(join(tmpdir(), 'forgejo-reconcile-'))
  try {
    const draft = join(root, 'draft.json')
    writeFileSync(draft, JSON.stringify(DRAFT))
    for (const found of [true, false]) {
      const preload = `
        const timer = globalThis.setTimeout
        globalThis.setTimeout = (fn, ms, ...args) => timer(fn, ms === 5000 ? 5 : ms, ...args)
        const state = { reads: 0 }
        globalThis.fetch = async (url, init) => {
          if (init?.method === 'POST') throw new Error('net')
          const reviews = !url.endsWith('/user') && ++state.reads >= 3 && ${found} ? [{ id: 99, user: { login: 'me' }, body: 'Итог', html_url: 'https://x/review-99' }] : []
          const body = url.endsWith('/user') ? { login: 'me' } : reviews
          return new Response(JSON.stringify(body), { headers: { 'x-total-count': String(reviews.length) } })
        }
      `
      const result = spawnSync(process.execPath, [
        '--import', `data:text/javascript,${encodeURIComponent(preload)}`,
        fileURLToPath(new URL('../cli/main.mts', import.meta.url)),
        'pr', 'review', '42', '--file', draft, '--confirm', '--host', 'git.example.org', '--owner', 'team', '--repo', 'app',
      ], { encoding: 'utf8', timeout: 2000, env: { ...process.env, FORGEJO_TOKEN: 'test-token' } })
      assert.equal(result.status, found ? 0 : 3, `${result.stderr} ${result.error ?? ''}`)
      if (found) assert.equal(JSON.parse(result.stdout).url, 'https://x/review-99')
      else assert.match(result.stderr, /статус публикации неизвестен/)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
