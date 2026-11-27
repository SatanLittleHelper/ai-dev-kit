import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateText } from '../src/validate.mts'
import { buildState } from '../src/init.mts'
import { parseRoadmap } from '../src/parse.mts'
import { makeRepo, roadmap, ROADMAP } from './support.mts'

const none = { state: null, sibling: () => 'missing' as const }
const rules = (text: string, ctx = none): string[] => validateText(text, ctx).map(problem => problem.rule).sort()

test('V1: корректный роадмап — без проблем', () => {
  assert.deepEqual(rules(ROADMAP), [])
})

test('V2: дубль id, TBD в качестве id, битый est, порядок тегов', () => {
  assert.deepEqual(rules('- [ ] A1 — Шаг\n- [ ] A1 — Ещё'), ['duplicate-id'])
  assert.deepEqual(rules('- [ ] TBD — Шаг'), ['flat-tbd'])
  assert.deepEqual(rules('- [ ] A1 — Шаг (est: много)'), ['estimate-malformed'])
  assert.deepEqual(rules('- [ ] A1 — Шаг (depends: B1) (est: 1–2д / agent: 1–2д)\n- [ ] B1 — Шаг'), ['tag-order'])
})

test('V3: потолок шага — по умолчанию manual ≤ 3д; limit из состояния меняет метрику', () => {
  const text = '- [ ] A1 — Большой (est: 2–4д / agent: 1–8д)'
  assert.deepEqual(rules(text), ['limit'])
  const state = { ...buildState('x', 'p', parseRoadmap(text)), limit: { metric: 'agent' as const, maxDays: 7 } }
  assert.deepEqual(rules(text, { state, sibling: () => 'missing' }), ['limit'])
  const lenient = { ...state, limit: { metric: 'agent' as const, maxDays: 9 } }
  assert.deepEqual(rules(text, { state: lenient, sibling: () => 'missing' }), [])
})

test('V4: зависимости — неизвестная, на себя, цикл', () => {
  assert.deepEqual(rules('- [ ] A1 — Шаг (depends: Z9)'), ['depends-unknown'])
  assert.deepEqual(rules('- [ ] A1 — Шаг (depends: A1)'), ['depends-self'])
  assert.deepEqual(rules('- [ ] A1 — Шаг (depends: B1)\n- [ ] B1 — Шаг (depends: A1)'), ['depends-cycle'])
})

test('V5: межроадмапные — нет папки допустимо, нет шага в состоянии — broken', () => {
  const text = '- [ ] A1 — Шаг (depends: other:B1)'
  assert.deepEqual(rules(text), [])
  const sibling = () => ({ state: { feature: 'other', roadmapPath: '', updatedAt: '', steps: [] }, ids: [] })
  assert.deepEqual(rules(text, { state: null, sibling }), ['depends-broken'])
})

test('V6: расхождения markdown и состояния', () => {
  const base = buildState('x', 'p', parseRoadmap(ROADMAP))
  assert.deepEqual(rules(ROADMAP, { state: base, sibling: () => 'missing' }), [])
  const drop = { ...base, steps: base.steps.slice(1) }
  assert.deepEqual(rules(ROADMAP, { state: drop, sibling: () => 'missing' }), ['state-missing-step'])
  const extra = { ...base, steps: [...base.steps, { ...base.steps[0], id: 'Z1' }] }
  assert.deepEqual(rules(ROADMAP, { state: extra, sibling: () => 'missing' }), ['state-extra-step'])
  const wrong = { ...base, steps: base.steps.map(step => (step.id === 'B1' ? { ...step, dependsOn: [] } : step)) }
  assert.deepEqual(rules(ROADMAP, { state: wrong, sibling: () => 'missing' }), ['state-depends'])
  const estimate = { ...base, steps: base.steps.map(step => (step.id === 'A1' ? { ...step, estimate: { ...step.estimate!, manual: { min: 1, max: 9 } } } : step)) }
  assert.deepEqual(rules(ROADMAP, { state: estimate, sibling: () => 'missing' }), ['state-estimate'])
})

test('V7: команда validate — ok/blocked с проблемами и номерами строк', () => {
  const { work } = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': ROADMAP.replace('(est: 1–2д', '(est: 1–5д') })
  const response = roadmap(work, {}, 'validate', 'x')
  assert.equal(response.code, 1)
  assert.equal(response.json.problems[0].rule, 'limit')
  assert.equal(response.json.problems[0].line, 9)
})
