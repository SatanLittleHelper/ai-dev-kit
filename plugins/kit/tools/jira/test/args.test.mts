import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCreateArgs, parseTransitionArgs } from '../cli/args.mts'
import { run } from '../cli/run.mts'
import { CliError, EXIT } from '../src/errors.mts'

const dir = mkdtempSync(join(tmpdir(), 'jira-args-'))
writeFileSync(join(dir, 't.txt'), 'Название задачи\n')
writeFileSync(join(dir, 'b.txt'), 'h3. Контекст\n* пункт\n')
writeFileSync(join(dir, 'empty.txt'), '  \n')
const read = (path: string) => readFileSync(path, 'utf8')
const file = (name: string) => join(dir, name)
const usage = (error: unknown) => error instanceof CliError && error.code === EXIT.FAILURE && /Использование/.test(error.message)
test('C1 U9: переход отклоняет неверный ключ, позиционные аргументы и флаги', () => {
  for (const args of [[], ['no-key'], ['ABC-42', 'ABC-43'], ['ABC-42', '--unknown'], ['ABC-42', '--dry-run', '--no-dry-run']]) {
    assert.throws(() => parseTransitionArgs(args), usage)
  }
})

test('C1 I1: дочерняя команда сверяет экземпляр до открытия карточки', async () => {
  let output = ''
  let diagnosis = ''
  const code = await run(['transition', 'ABC-42'], {
    cwd: dir,
    env: { JIRA_HOME: dir, JIRA_EXPECTED_INSTANCE: 'https://jira.example.com/team' },
    readFile: () => JSON.stringify({ jira: { baseUrl: 'https://other.example.com' } }),
    out: text => { output = text },
    err: text => { diagnosis = text },
  })
  assert.equal(code, EXIT.FAILURE)
  assert.match(diagnosis, /экземпляр Jira/)
  assert.equal(output, '')
})

test('U18: полный набор флагов разбирается', () => {
  const args = parseCreateArgs([
    '--type', 'Task', '--title-file', file('t.txt'), '--body-file', file('b.txt'),
    '--assignee', 'me', '--parent', 'KEY-12', '--sprint', 'Спринт 5', '--project', 'ABC',
  ], read)
  assert.deepEqual(args, {
    title: 'Название задачи', body: 'h3. Контекст\n* пункт', dryRun: undefined, project: 'ABC', type: 'Task',
    assignee: 'me', parent: 'KEY-12', sprint: 'Спринт 5',
  })
})

test('U19: без --title-file — ошибка использования', () => {
  assert.throws(() => parseCreateArgs(['--body-file', file('b.txt')], read), usage)
})

test('U20: без --body-file — ошибка использования', () => {
  assert.throws(() => parseCreateArgs(['--title-file', file('t.txt')], read), usage)
})

test('U21: пустое название — ошибка', () => {
  assert.throws(() => parseCreateArgs(['--title-file', file('empty.txt'), '--body-file', file('b.txt')], read), usage)
})

test('U22: файл названия не найден — ошибка с путём файла', () => {
  const missing = file('missing.txt')
  assert.throws(
    () => parseCreateArgs(['--title-file', missing, '--body-file', file('b.txt')], read),
    (error: unknown) => usage(error) && (error as CliError).message.includes(missing),
  )
})

test('U23: неизвестный флаг — ошибка использования', () => {
  assert.throws(() => parseCreateArgs(['--foo', 'x'], read), usage)
})

test('U24: флаг без значения — ошибка использования', () => {
  assert.throws(() => parseCreateArgs(['--title-file', file('t.txt'), '--body-file', file('b.txt'), '--assignee'], read), usage)
})

test('U25: --dry-run включает пробный запуск, --no-dry-run выключает, без флагов значение не задано', () => {
  const base = ['--title-file', file('t.txt'), '--body-file', file('b.txt')]
  const on = parseCreateArgs(['--dry-run', '--type', 'Task', ...base], read)
  assert.equal(on.dryRun, true)
  assert.equal(on.type, 'Task')
  assert.equal(parseCreateArgs(base, read).dryRun, undefined)
  assert.equal(parseCreateArgs(['--no-dry-run', ...base], read).dryRun, false)
  assert.throws(() => parseCreateArgs(['--dry-run', '--no-dry-run', ...base], read), /нельзя использовать вместе/)
})
