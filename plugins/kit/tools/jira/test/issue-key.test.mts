import assert from 'node:assert/strict'
import { test } from 'node:test'

const issueKey = await import('../src/issue-key.mts').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('issue-key.mts')) return undefined
  throw error
})

test('K1 U1: isIssueKey и ISSUE_KEY принимают только ключ целиком', () => {
  assert.ok(issueKey, 'Модуль проверки ключа должен существовать')
  assert.equal(issueKey.isIssueKey('ABC-123'), true)
  assert.equal(issueKey.isIssueKey('AB_C2-7'), true)
  for (const value of ['', 'abc-1', 'ABC-', 'ABC-1 ', 'XABC-1x', 'ABC']) assert.equal(issueKey.isIssueKey(value), false, value)
  assert.equal(issueKey.ISSUE_KEY.test('ABC-1'), true)
})

test('K1 U2: keyAtStart берёт ключ только в начале текста', () => {
  assert.ok(issueKey, 'Модуль проверки ключа должен существовать')
  assert.equal(issueKey.keyAtStart('ABC-42 Заголовок'), 'ABC-42')
  assert.equal(issueKey.keyAtStart('Заголовок ABC-42'), undefined)
})

test('K1 U3: issueKeysIn находит ключи, не цепляя куски длинных слов', () => {
  assert.ok(issueKey, 'Модуль проверки ключа должен существовать')
  assert.deepEqual(issueKey.issueKeysIn('ABC-1-fix и XYZ-22'), ['ABC-1', 'XYZ-22'])
  assert.deepEqual(issueKey.issueKeysIn('ABC-1X'), [])
})
