import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkSpec } from '../src/validators/spec.mts'

test('корректная спека проходит', () => {
  assert.deepEqual(checkSpec('# Спека\n\n## Цель\n\nОписать поведение рабочих пакетов на русском языке.'), [])
})

test('спека без заголовка первого уровня отклоняется', () => {
  assert.equal(checkSpec('## Цель\n\nОписать поведение рабочих пакетов на русском языке.').some(problem => /заголовок/.test(problem)), true)
})

test('спека с заглушкой отклоняется с названием заглушки', () => {
  assert.equal(checkSpec('# Спека\n\nРаздел требований: TBD, описание на русском языке.').some(problem => problem.includes('TBD')), true)
})

test('английская спека отклоняется', () => {
  assert.equal(checkSpec('# Spec\n\nEverything here is written in English only.').some(problem => /русск/.test(problem)), true)
})
