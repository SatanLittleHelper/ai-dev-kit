import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { applyTable, estimateTag, fmt, totals } from '../src/estimate.mts'
import type { Step } from '../src/model.mts'
import { makeRepo, roadmap, ROADMAP, write } from './support.mts'

const step = (id: string, manual: [number, number], agent: [number, number], extra: Partial<Step> = {}): Step => ({
  id, title: id, ticket: 'TBD', dependsOn: [], status: 'not-started', stepFolder: null, specPath: null, testPlanPath: null, planPath: null,
  estimate: { manual: { min: manual[0], max: manual[1] }, agent: { min: agent[0], max: agent[1] }, basis: 'initial', actualDays: null }, ...extra,
})

test('E1: числа и тег', () => {
  assert.equal(fmt(0.5), '0.5')
  assert.equal(fmt(7.75), '7.75')
  assert.equal(fmt(3), '3')
  assert.equal(estimateTag(step('A', [1, 3], [0.5, 1.5]).estimate!), '(est: 1–3д / agent: 0.5–1.5д)')
})

test('E2: суммы воспроизводят таблицу роадмапа roadmap-tool (A1 → B1)', () => {
  const steps = [step('A1', [9, 14], [4.5, 7]), step('B1', [6.5, 11], [3.25, 5.5], { dependsOn: ['A1'] })]
  const result = totals(steps)
  assert.deepEqual(result.sum, { manual: { min: 15.5, max: 25 }, agent: { min: 7.75, max: 12.5 } })
  assert.deepEqual(result.critical, result.sum)
  assert.deepEqual(result.remaining, result.sum)
})

test('E3: критический путь — цепочка с наибольшим max; остаток без закрытых', () => {
  const steps = [step('A', [1, 2], [1, 1]), step('B', [1, 5], [1, 1], { dependsOn: ['A'] }), step('C', [1, 3], [1, 1], { dependsOn: ['A'] }), step('D', [1, 1], [1, 1], { status: 'closed' })]
  const result = totals(steps)
  assert.deepEqual(result.critical.manual, { min: 2, max: 7 })
  assert.deepEqual(result.sum.manual, { min: 4, max: 11 })
  assert.deepEqual(result.remaining.manual, { min: 3, max: 10 })
})

test('E4: межроадмапная зависимость не входит в путь и отмечается', () => {
  const result = totals([step('A', [1, 2], [1, 1], { dependsOn: ['other:X'] })])
  assert.equal(result.crossRoadmap, true)
  assert.deepEqual(result.critical.manual, { min: 1, max: 2 })
})

test('E5: applyTable заменяет таблицу, сохраняя остальной текст', () => {
  const lines = ROADMAP.split('\n')
  const out = applyTable(lines, totals([step('A1', [1, 2], [0.5, 1]), step('B1', [2, 3], [1, 2], { dependsOn: ['A1'] })])).join('\n')
  assert.match(out, /\| Сумма по шагам \| 3–5д \| 1\.5–3д \|/)
  assert.match(out, /\| Критический путь \(depends\) \| 3–5д \| 1\.5–3д \|/)
  assert.match(out, /Допущения: день — 6 часов\./)
  assert.doesNotMatch(out, /0–0д/)
})

test('E6: команда estimate обновляет таблицу и теги по состоянию', () => {
  const state = { feature: 'x', roadmapPath: 'docs/x/2026-01-01-x-roadmap.md', updatedAt: 'x', steps: [step('A1', [1, 2], [0.5, 1]), step('B1', [2, 4], [1, 2], { dependsOn: ['A1'] })] }
  const { work } = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': ROADMAP, 'docs/x/roadmap-state.json': JSON.stringify(state) })
  const response = roadmap(work, {}, 'estimate', 'x')
  assert.equal(response.json.result, 'ok', response.stdout)
  const text = readFileSync(join(work, 'docs/x/2026-01-01-x-roadmap.md'), 'utf8')
  assert.match(text, /\(est: 2–4д \/ agent: 1–2д\) \(depends: A1\)/)
  assert.match(text, /\| Сумма по шагам \| 3–6д \| 1\.5–3д \|/)
  write(work, 'unused', '')
})
