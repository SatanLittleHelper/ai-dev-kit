import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRoadmap } from '../src/parse.mts'
import { ROADMAP } from './support.mts'

test('P1: заголовок, контекст, шаги, теги', () => {
  const roadmap = parseRoadmap(ROADMAP)
  assert.equal(roadmap.title, 'Пример')
  assert.equal(roadmap.context, 'Нужно разложить большую задачу на шаги.')
  assert.deepEqual(roadmap.checkpoints.map(step => [step.id, step.title, step.checked, step.line]), [['A1', 'Первый шаг', false, 9], ['B1', 'Второй шаг', false, 13]])
  const [a1, b1] = roadmap.checkpoints
  assert.equal(a1.ticket, 'TBD')
  assert.deepEqual(a1.estimate, { manual: { min: 1, max: 2 }, agent: { min: 0.5, max: 1 } })
  assert.deepEqual(b1.dependsOn, ['A1'])
  assert.equal(b1.tagOrderOk, true)
  assert.equal(a1.scope, 'сделать первое.')
  assert.equal(a1.done, 'первое работает.')
})

test('P2: выполненный шаг, дефис в диапазоне, заголовок со скобками, шаг без тегов', () => {
  const text = '# Роадмап: X\n\n- [x] A1 — Модуль (api) и клиент (est: 1-2д / agent: 0.5-1д)\n- [ ] A2 — Просто шаг\n'
  const [a1, a2] = parseRoadmap(text).checkpoints
  assert.equal(a1.checked, true)
  assert.equal(a1.title, 'Модуль (api) и клиент')
  assert.deepEqual(a1.estimate?.manual, { min: 1, max: 2 })
  assert.equal(a2.estimate, null)
  assert.equal(a2.ticket, null)
  assert.deepEqual(a2.dependsOn, [])
})

test('P3: нарушенный порядок тегов и битый est', () => {
  const [wrongOrder, malformed] = parseRoadmap('- [ ] A1 — Шаг (depends: B1) (est: 1–2д / agent: 1–2д)\n- [ ] B1 — Шаг (est: много)\n').checkpoints
  assert.equal(wrongOrder.tagOrderOk, false)
  assert.equal(malformed.estimateMalformed, true)
})

test('P4: межроадмапные зависимости остаются как есть', () => {
  const [step] = parseRoadmap('- [ ] A1 — Шаг (depends: other:B1, A0)\n').checkpoints
  assert.deepEqual(step.dependsOn, ['other:B1', 'A0'])
})
