import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeRepo, roadmap, ROADMAP } from './support.mts'

test('F1: нет роадмапов — blocked', () => {
  const { work } = makeRepo()
  assert.equal(roadmap(work, {}, 'estimate').json.result, 'blocked')
})

test('F2: несколько роадмапов без slug — needs-input со списком', () => {
  const { work } = makeRepo({ 'docs/a/2026-01-01-a-roadmap.md': ROADMAP, 'docs/b/2026-01-01-b-roadmap.md': ROADMAP })
  const response = roadmap(work, {}, 'estimate')
  assert.equal(response.code, 2)
  assert.deepEqual(response.json.options, ['a', 'b'])
})

test('F3: один роадмап выбирается сам; неизвестный slug — blocked', () => {
  const { work } = makeRepo({ 'docs/a/2026-01-01-a-roadmap.md': ROADMAP })
  assert.notEqual(roadmap(work, {}, 'estimate').json.result, 'needs-input')
  assert.equal(roadmap(work, {}, 'estimate', 'zzz').json.result, 'blocked')
})
