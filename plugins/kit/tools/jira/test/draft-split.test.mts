import assert from 'node:assert/strict'
import { test } from 'node:test'
const splitModule = await import('../src/draft/split.mts').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return undefined
  throw error
})
const parseDraft = (...args: [string]) => {
  assert.ok(splitModule?.parseDraft, 'Разбор черновика должен существовать')
  return splitModule.parseDraft(...args)
}

const DRAFT = '```\nНазвание\n```\n\n```\nh3. Контекст\nТекст.\n```\n'

test('D1: два блока разбираются на название и тело', () => {
  assert.deepEqual(parseDraft(DRAFT), { ok: true, title: 'Название', body: 'h3. Контекст\nТекст.', titleLine: 2, bodyLine: 6 })
})

test('D2: один блок — ошибка block-count', () => {
  const result = parseDraft('```\nНазвание\n```\n')
  assert.equal(result.ok, false)
  assert.deepEqual(!result.ok && result.errors.map(error => error.rule), ['block-count'])
})

test('D3: текст вне блоков — ошибка outside-block с номером строки', () => {
  const result = parseDraft('Название:\n' + DRAFT)
  assert.equal(result.ok, false)
  assert.deepEqual(!result.ok && result.errors.map(error => [error.rule, error.line]), [['outside-block', 1]])
})

test('D4: незакрытый блок — ошибка unclosed-block', () => {
  const result = parseDraft('```\nА\n```\n```\nБ\n')
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.errors.some(error => error.rule === 'unclosed-block'))
})

test('D5: CRLF и пустые строки по краям блока не мешают', () => {
  const result = parseDraft('```\r\n\r\nНазвание\r\n```\r\n```\r\nТело\r\n\r\n```\r\n')
  assert.ok(result.ok && result.title === 'Название' && result.body === 'Тело')
})
