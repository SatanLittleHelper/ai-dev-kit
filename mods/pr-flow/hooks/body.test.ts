import { expect, test } from 'claude-code/testing'

import { validateBody } from './body'

const GOOD = [
  '**Серьёзность: Серьёзные** — затронута миграция БД',
  '',
  '## Зачем',
  'x',
  '',
  '## Что сделано',
  '- y',
].join('\n')

test('подходящее описание проходит', async () => {
  expect(validateBody(GOOD, { level: 'Средние', reason: 'r' })).toBe(undefined)
  expect(validateBody(GOOD)).toBe(undefined)
  expect(validateBody(GOOD, { level: 'Серьёзные', reason: 'r' })).toBe(undefined)
  expect(validateBody(`\n\n${GOOD}`, { level: 'Лёгкие', reason: 'r' })).toBe(undefined)
})

test('уровень ниже границы отклоняется с причиной границы', async () => {
  const problem = validateBody(GOOD, { level: 'Критичные', reason: 'деструктивная миграция' })

  expect(problem?.includes('Критичные')).toBe(true)
  expect(problem?.includes('деструктивная миграция')).toBe(true)
})

test('неверная первая строка отклоняется', async () => {
  expect(validateBody('## Что сделано\n- y')?.includes('Первая строка')).toBe(true)
  expect(validateBody('**Серьёзность: Огромные** — x\n\n## Что сделано')?.includes('Первая строка')).toBe(true)
  expect(validateBody('**Серьёзность: Лёгкие**\n\n## Что сделано')?.includes('Первая строка')).toBe(true)
})

test('без раздела «Что сделано» отклоняется', async () => {
  expect(validateBody('**Серьёзность: Лёгкие** — док\n\n## Зачем\nx')?.includes('Что сделано')).toBe(true)
})
