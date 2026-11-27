import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeRepo, roadmap, ROADMAP, write } from './support.mts'

test('CR1: init создаёт состояние из чек-листа, не затирая существующее', () => {
  const { work } = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': ROADMAP })
  const first = roadmap(work, {}, 'init', 'x')
  assert.equal(first.json.result, 'ok', first.stdout)
  const state = JSON.parse(readFileSync(join(work, 'docs/x/roadmap-state.json'), 'utf8'))
  assert.deepEqual(state.steps.map((step: { id: string; status: string; dependsOn: string[] }) => [step.id, step.status, step.dependsOn]), [['A1', 'not-started', []], ['B1', 'not-started', ['A1']]])
  assert.deepEqual(state.steps[0].estimate, { manual: { min: 1, max: 2 }, agent: { min: 0.5, max: 1 }, basis: 'initial', actualDays: null })
  assert.equal(roadmap(work, {}, 'init', 'x').json.result, 'blocked')
})

test('CR2: create сохраняет согласованный черновик, создаёт состояние и считает оценку', () => {
  const { work } = makeRepo()
  write(work, 'tmp/drafts/x.md', ROADMAP)
  const response = roadmap(work, {}, 'create', 'tmp/drafts/x.md', 'x', '--date', '2026-11-27', '--limit', 'agent:7')
  assert.equal(response.json.result, 'ok', response.stdout)
  assert.equal(response.json.path, 'docs/x/2026-11-27-x-roadmap.md')
  const text = readFileSync(join(work, 'docs/x/2026-11-27-x-roadmap.md'), 'utf8')
  assert.match(text, /\| Сумма по шагам \| 3–5д \| 1\.5–3д \|/)
  const state = JSON.parse(readFileSync(join(work, 'docs/x/roadmap-state.json'), 'utf8'))
  assert.deepEqual(state.limit, { metric: 'agent', maxDays: 7 })
  assert.equal(state.roadmapPath, 'docs/x/2026-11-27-x-roadmap.md')
})

test('CR3: create отклоняет невалидный черновик и занятый slug', () => {
  const { work } = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': ROADMAP })
  write(work, 'tmp/drafts/bad.md', '- [ ] A1 — Шаг (depends: Z9)\n')
  const bad = roadmap(work, {}, 'create', 'tmp/drafts/bad.md', 'y')
  assert.equal(bad.code, 1)
  assert.equal(bad.json.problems[0].rule, 'depends-unknown')
  assert.equal(existsSync(join(work, 'docs/y')), false)
  write(work, 'tmp/drafts/ok.md', ROADMAP)
  assert.equal(roadmap(work, {}, 'create', 'tmp/drafts/ok.md', 'x').json.result, 'blocked')
})
