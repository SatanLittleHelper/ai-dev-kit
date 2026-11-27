import assert from 'node:assert/strict'
import { test } from 'node:test'
const lintModule = await import('../src/draft/lint.mts').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return undefined
  throw error
})
const requireLint = (name: string) => {
  assert.ok(lintModule?.[name], `Функция ${name} должна существовать`)
  return lintModule[name]
}
const lintMarkup = (...args: any[]) => requireLint('lintMarkup')(...args)
const lintTitle = (...args: any[]) => requireLint('lintTitle')(...args)
const lintIssueBody = (...args: any[]) => requireLint('lintIssueBody')(...args)
const lintIssueDraft = (...args: any[]) => requireLint('lintIssueDraft')(...args)
const assertNoLintErrors = (...args: any[]) => requireLint('assertNoLintErrors')(...args)
import { CliError } from '../src/errors.mts'

const rules = (errors: { rule: string }[]): string[] => errors.map(error => error.rule)
const lines = (...parts: string[]): string => parts.join('\n')

const VALID = lines(
  'h3. Контекст', 'Аудит показал, что экспорт падает на больших файлах.', '',
  'h3. Проблема', '* Экспорт падает на файлах больше 10 МБ', '',
  'h3. Критерии приемки', '* Экспорт 50 МБ проходит', '* Ошибка пишется в лог', '* Время меньше минуты',
)

test('L1: корректное тело — без ошибок', () => {
  assert.deepEqual(lintIssueBody(VALID), [])
})

test('L2: {{...}} с точкой — inline-code', () => {
  assert.deepEqual(rules(lintMarkup('* Файл {{a.b}} лежит тут')), ['inline-code'])
})

test('L3: простой идентификатор в {{...}} допустим', () => {
  assert.deepEqual(lintMarkup('* Метод {{getAddresses()}} в сервисе'), [])
})

test('L4: строка, оканчивающаяся на {{...}}', () => {
  assert.deepEqual(rules(lintMarkup('* Метод {{findById(id)}}')), ['inline-code-line-end'])
})

test('L5: маркер «-» и заголовок h2.', () => {
  assert.deepEqual(rules(lintMarkup('- пункт\nh2. Описание')), ['bullet-marker', 'heading-h2'])
})

test('L6: внутри {code} правила не применяются', () => {
  assert.deepEqual(lintMarkup('{code}\n- x {{a.b}}\n{code}'), [])
})

test('L7: номер строки учитывает смещение', () => {
  assert.equal(lintMarkup('ок\n- пункт', 10)[0].line, 11)
})

test('L8: нет обязательной секции «Проблема»', () => {
  const body = VALID.replace(/h3\. Проблема\n\* [^\n]*\n\n/, '')
  assert.deepEqual(rules(lintIssueBody(body)), ['section-missing'])
})

test('L9: секции в неверном порядке и неизвестная секция', () => {
  const swapped = lines('h3. Проблема', '* а', 'h3. Контекст', 'Один.', 'h3. Критерии приемки', '* 1', '* 2', '* 3')
  assert.deepEqual(rules(lintIssueBody(swapped)), ['section-order'])
  assert.deepEqual(rules(lintIssueBody(VALID + '\nh3. Объем\n* х')), ['section-name'])
})

test('L10: лимиты пунктов', () => {
  const solution = lines('h3. Решение', '* 1', '* 2', '* 3', '* 4')
  assert.deepEqual(rules(lintIssueBody(VALID.replace('h3. Критерии', `${solution}\n\nh3. Критерии`))), ['bullet-limit'])
  assert.deepEqual(rules(lintIssueBody(VALID.replace('* Ошибка пишется в лог\n* Время меньше минуты', ''))), ['bullet-limit'])
})

test('L11: «Контекст» — одно предложение', () => {
  const body = VALID.replace('Аудит показал, что экспорт падает на больших файлах.', 'Аудит показал сбой. Он важен сейчас.')
  assert.deepEqual(rules(lintIssueBody(body)), ['context-sentences'])
})

test('L12: название — префиксы, одна строка, без h2.', () => {
  assert.deepEqual(lintTitle('[тех-долг] [web] Закрыть редирект'), [])
  assert.deepEqual(rules(lintTitle('[а] [б] [в] Закрыть редирект')), ['title-prefixes'])
  assert.deepEqual(rules(lintTitle('Первая\nВторая')), ['title-lines'])
  assert.deepEqual(rules(lintTitle('h2. Название')), ['title-heading'])
  assert.deepEqual(rules(lintTitle('  ')), ['title-empty'])
})

test('L13: lintIssueDraft — номера строк из файла черновика', () => {
  const draft = '```\nНазвание\n```\n\n```\n' + VALID.replace('* Экспорт падает', '- Экспорт падает') + '\n```\n'
  const errors = lintIssueDraft(draft)
  assert.deepEqual(errors.map(error => [error.rule, error.line]), [['bullet-marker', 10]])
})

test('L14: assertNoLintErrors бросает CliError с кодом 1', () => {
  assert.throws(() => assertNoLintErrors(lintMarkup('- x'), 'Тело'), (error: unknown) => error instanceof CliError && error.code === 1 && /bullet-marker/.test(error.message))
  assert.doesNotThrow(() => assertNoLintErrors([], 'Тело'))
})
