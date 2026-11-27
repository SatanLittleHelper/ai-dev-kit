import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as argsModule from '../cli/args.mts'
const parseCommentArgs = (...args: any[]) => {
  const parse = (argsModule as any).parseCommentArgs
  assert.ok(parse, 'Разбор аргументов comment должен существовать')
  return parse(...args)
}
import { CliError } from '../src/errors.mts'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()
const KEY = 'ABC-42'
const BODY = 'Проверено, см. {{getAddresses()}} в сервисе'
const COMMENT = ['comment', KEY, '--body-file', 'b.txt']

function issue(): void {
  fake.state.issues.push({ key: KEY, project: 'ABC', type: 'Task', summary: 'Задача', description: '', status: 'Open' })
}

test('CM1 U1: разбор аргументов comment', () => {
  const read = (path: string): string => (path === 'b.txt' ? ' Текст \n' : path === 'empty.txt' ? '\n' : (() => { throw new Error('нет файла') })())
  assert.deepEqual(parseCommentArgs([KEY, '--body-file', 'b.txt'], read), { key: KEY, body: ' Текст', dryRun: undefined })
  assert.equal(parseCommentArgs([KEY, '--body-file', 'b.txt', '--dry-run'], read).dryRun, true)
  assert.equal(parseCommentArgs([KEY, '--body-file', 'b.txt', '--no-dry-run'], read).dryRun, false)
  for (const args of [[], ['no-key', '--body-file', 'b.txt'], [KEY], [KEY, '--body-file', 'empty.txt'], [KEY, '--body-file', 'missing.txt'], [KEY, '--body-file', 'b.txt', '--title-file', 'b.txt'], [KEY, '--body-file', 'b.txt', '--dry-run', '--no-dry-run']]) {
    assert.throws(() => parseCommentArgs(args, read), CliError)
  }
})

test('CM1 I1: комментарий добавлен', async () => {
  issue()
  const response = await sandbox(fake, { body: BODY }).run(COMMENT)

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { key: KEY, url: `${fake.url}/browse/${KEY}`, result: 'commented' })
  assert.deepEqual(fake.state.issues[0].comments, [BODY])
})

test('CM1 I2: --dry-run заполняет форму, но не добавляет', async () => {
  issue()
  const response = await sandbox(fake, { body: BODY }).run([...COMMENT, '--dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.equal(JSON.parse(response.stdout).result, 'dry-run')
  assert.equal(fake.state.commentSaves, 0)
})

test('CM1 I3: ошибка разметки — код 1, Jira не трогается', async () => {
  issue()
  const response = await sandbox(fake, { body: 'Файл {{a.b}} тут' }).run(COMMENT)

  assert.equal(response.code, 1)
  assert.match(response.stderr, /inline-code/)
  assert.equal(fake.state.commentSaves, 0)
  assert.equal(fake.state.issueReads, 0)
})

test('CM1 I4: карточки нет — код 3', async () => {
  const response = await sandbox(fake, { body: BODY }).run(['comment', 'ABC-99', '--body-file', 'b.txt'])

  assert.equal(response.code, 3, response.stderr)
  assert.equal(fake.state.commentSaves, 0)
})

test('CM1 I5: нет сессии — код 2', async () => {
  issue()
  fake.state.loggedIn = false
  const response = await sandbox(fake, { body: BODY }).run(COMMENT)

  assert.equal(response.code, 2, response.stderr)
})

test('CM1 I6: Jira не ответила — код 5, без повтора', async () => {
  issue()
  fake.state.writeMode = 'noReply'
  const response = await sandbox(fake, { body: BODY }).run(COMMENT)

  assert.equal(response.code, 5, response.stderr)
  assert.match(response.stderr, /Состояние неизвестно/)
  assert.equal(fake.state.commentSaves, 1)
})

test('CM1 I7: Jira отклонила запись — код 5', async () => {
  issue()
  fake.state.writeMode = 'rejected'
  const response = await sandbox(fake, { body: BODY }).run(COMMENT)

  assert.equal(response.code, 5, response.stderr)
  assert.match(response.stderr, /Jira отклонила запись/)
})

test('CM1 I8: jira.dryRun в настройках включает пробный запуск, --no-dry-run перебивает', async () => {
  issue()
  const first = await sandbox(fake, { body: BODY, jira: { dryRun: true } }).run(COMMENT)
  assert.equal(JSON.parse(first.stdout).result, 'dry-run')
  assert.match(first.stderr, /--no-dry-run/)
  const second = await sandbox(fake, { body: BODY, jira: { dryRun: true } }).run([...COMMENT, '--no-dry-run'])
  assert.equal(JSON.parse(second.stdout).result, 'commented')
})
