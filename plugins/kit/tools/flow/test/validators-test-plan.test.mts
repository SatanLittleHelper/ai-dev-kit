import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkTestPlan, extractTestIds } from '../src/validators/test-plan.mts'

const card = (id: string, layer = 'unit'): string => [`**${id} · возвращает отказ для удалённого пользователя**  [${layer}]`, '- Дано: пользователь с признаком удаления', '- Когда: запрос по идентификатору', '- Тогда: отказ с кодом 404', '- Ловит: удалённый пользователь снова отдаётся', ''].join('\n')

const plan = (...cards: string[]): string => ['# Тест-план', '', '## R1 · Пользователь удалён', '', ...cards].join('\n')

test('корректный тест-план проходит', () => {
  assert.deepEqual(checkTestPlan(plan(card('U1'), card('U2'), card('I1', 'integration'))), [])
})

test('ID извлекаются из карточек по порядку', () => {
  assert.deepEqual(extractTestIds(plan(card('U1'), card('I1', 'integration'), card('U2'))), ['U1', 'I1', 'U2'])
})

test('нет заголовка требования', () => {
  const text = '# Тест-план\n\n' + card('U1')

  assert.equal(checkTestPlan(text).some(problem => /R<N>|требован/.test(problem)), true)
})

test('в карточке нет поля Ловит', () => {
  const text = plan(card('U1').replace(/- Ловит:.*\n/, ''))

  assert.equal(checkTestPlan(text).some(problem => problem.includes('U1') && problem.includes('Ловит')), true)
})

test('ID идут не подряд', () => {
  assert.equal(checkTestPlan(plan(card('U1'), card('U3'))).some(problem => problem.includes('U3')), true)
})

test('повторяющийся ID', () => {
  assert.equal(checkTestPlan(plan(card('U1'), card('U1'))).some(problem => problem.includes('U1')), true)
})

test('код в тест-плане запрещён', () => {
  const text = plan(card('U1')) + '\n```ts\nexpect(1).toBe(1)\n```\n'

  assert.equal(checkTestPlan(text).some(problem => /код/.test(problem)), true)
})

test('заглушка в тест-плане', () => {
  assert.equal(checkTestPlan(plan(card('U1')) + '\nаналогично U1\n').some(problem => problem.includes('аналогично U1')), true)
})
