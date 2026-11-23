import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPlaceholders, stripCode } from '../src/validators/markdown.mts'
import { checkRussian } from '../src/validators/language.mts'

test('русский документ с английским кодом проходит', () => {
  const text = ['# Заголовок', '', 'Описание поведения на русском языке, с `inline code` и ссылкой https://example.com/page.', '', '```ts', 'export function veryLongEnglishIdentifierName(argumentNumberOne: string): string { return argumentNumberOne }', '```'].join('\n')

  assert.deepEqual(checkRussian(text), [])
})

test('английский документ отклоняется', () => {
  const problems = checkRussian('# Title\n\nThis document is written entirely in English language.')

  assert.equal(problems.length, 1)
  assert.match(problems[0], /русск/)
})

test('метки шаблона плана не считаются английским текстом', () => {
  const text = ['# План', '', '> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans', '', '### Task 1: Название задачи', '', '**Files:**', '- Create: `src/a.mts`', '', '**Interfaces:**', '- Consumes: ничего', '- Produces: функцию', '', 'Описание задачи на русском языке, достаточно длинное.'].join('\n')

  assert.deepEqual(checkRussian(text), [])
})

test('пустой документ отклоняется', () => {
  assert.equal(checkRussian('   \n').length, 1)
})

test('stripCode вырезает блоки и строчный код', () => {
  assert.equal(stripCode('до `x` после\n```\nкод\n```\nконец').replace(/\s+/g, ' ').trim(), 'до после конец')
})

test('заглушки находятся вне кода и игнорируются внутри кода', () => {
  assert.deepEqual(findPlaceholders('Сделать позже TBD и т.д.'), ['TBD', 'и т.д.'])
  assert.deepEqual(findPlaceholders('```\nTODO внутри кода\n```'), [])
  assert.deepEqual(findPlaceholders('аналогично U2 и Similar to Task 3'), ['аналогично U2', 'Similar to Task'])
})
