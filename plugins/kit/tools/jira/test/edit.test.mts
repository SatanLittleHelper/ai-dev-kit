import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as argsModule from '../cli/args.mts'
const parseEditArgs = (...args: any[]) => {
  const parse = (argsModule as any).parseEditArgs
  assert.ok(parse, 'Разбор аргументов edit должен существовать')
  return parse(...args)
}
import { CliError } from '../src/errors.mts'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()
const KEY = 'ABC-42'
const BODY = 'h3. Контекст\n* пункт'
const BOTH = ['edit', KEY, '--title-file', 't.txt', '--body-file', 'b.txt']

function issue(extra: { summary?: string; description?: string } = {}): void {
  fake.state.issues.push({ key: KEY, project: 'ABC', type: 'Task', summary: 'Старое', description: 'старое', status: 'Open', ...extra })
}

test('ED1 U1: разбор аргументов edit', () => {
  const files: Record<string, string> = { 't.txt': ' Название \n', 'b.txt': 'Тело\n', 'empty.txt': '\n' }
  const read = (path: string): string => {
    if (!(path in files)) throw new Error('нет файла')
    return files[path]
  }
  assert.deepEqual(parseEditArgs([KEY, '--title-file', 't.txt'], read), { key: KEY, title: 'Название', body: undefined, dryRun: undefined })
  assert.deepEqual(parseEditArgs([KEY, '--body-file', 'b.txt', '--dry-run'], read), { key: KEY, title: undefined, body: 'Тело', dryRun: true })
  for (const args of [[], [KEY], ['no-key', '--title-file', 't.txt'], [KEY, '--title-file', 'empty.txt'], [KEY, '--body-file', 'empty.txt'], [KEY, '--title-file', 'missing.txt'], [KEY, '--type', 'Task']]) {
    assert.throws(() => parseEditArgs(args, read), CliError)
  }
})

test('ED1 I1: заголовок и описание заменены', async () => {
  issue()
  const response = await sandbox(fake, { body: BODY }).run([...BOTH, '--no-dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { key: KEY, url: `${fake.url}/browse/${KEY}`, result: 'edited', changed: ['title', 'description'] })
  assert.equal(fake.state.issues[0].summary, 'Заголовок задачи')
  assert.equal(fake.state.issues[0].description, BODY)
})

test('ED1 I2: только заголовок — описание не тронуто', async () => {
  issue()
  const response = await sandbox(fake).run(['edit', KEY, '--title-file', 't.txt'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout).changed, ['title'])
  assert.equal(fake.state.issues[0].summary, 'Заголовок задачи')
  assert.equal(fake.state.issues[0].description, 'старое')
})

test('ED1 I3: значения совпадают — unchanged, Jira не обновляется', async () => {
  issue({ summary: 'Заголовок задачи', description: BODY })
  const response = await sandbox(fake, { body: BODY }).run(BOTH)

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { key: KEY, url: `${fake.url}/browse/${KEY}`, result: 'unchanged', changed: [] })
  assert.equal(fake.state.editSaves, 0)
})

test('ED1 I4: --dry-run заполняет форму, но не сохраняет', async () => {
  issue()
  const response = await sandbox(fake, { body: BODY }).run([...BOTH, '--dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout).result, 'dry-run')
  assert.deepEqual(JSON.parse(response.stdout).changed, ['title', 'description'])
  assert.equal(fake.state.editSaves, 0)
  assert.equal(fake.state.issues[0].summary, 'Старое')
})

test('ED1 I5: ошибка разметки — код 1, Jira не трогается', async () => {
  issue()
  const response = await sandbox(fake, { body: 'Файл {{a.b}} тут' }).run(BOTH)

  assert.equal(response.code, 1)
  assert.match(response.stderr, /inline-code/)
  assert.equal(fake.state.issueReads, 0)
  assert.equal(fake.state.editSaves, 0)
})

test('ED1 I6: карточки нет — код 3', async () => {
  const response = await sandbox(fake, { body: BODY }).run(['edit', 'ABC-99', '--title-file', 't.txt'])

  assert.equal(response.code, 3, response.stderr)
})

test('ED1 I7: Jira не ответила — код 5, ничего не изменилось', async () => {
  issue()
  fake.state.writeMode = 'noReply'
  const response = await sandbox(fake, { body: BODY }).run(BOTH)

  assert.equal(response.code, 5, response.stderr)
  assert.match(response.stderr, /Состояние неизвестно/)
  assert.equal(fake.state.editSaves, 1)
  assert.equal(fake.state.issues[0].summary, 'Старое')
})

test('ED1 I8: Jira отклонила запись — код 5', async () => {
  issue()
  fake.state.writeMode = 'rejected'
  const response = await sandbox(fake, { body: BODY }).run(BOTH)

  assert.equal(response.code, 5, response.stderr)
  assert.match(response.stderr, /Jira отклонила запись/)
})
