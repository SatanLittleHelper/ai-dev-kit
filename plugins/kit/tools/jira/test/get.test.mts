import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as argsModule from '../cli/args.mts'
import { CliError } from '../src/errors.mts'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()
const KEY = 'ABC-42'

function issue(extra: { status?: string; assignee?: string; description?: string } = {}): void {
  fake.state.issues.push({ key: KEY, project: 'ABC', type: 'Task', summary: 'Задача', description: '', status: 'Open', ...extra })
  fake.state.transitionLayout = 'menu'
}

test('G1 U1: ключ разбирается, лишнее отклоняется', () => {
  const parseGetArgs = (argsModule as typeof argsModule & { parseGetArgs?: (argv: string[]) => { key: string; withDescription: boolean } }).parseGetArgs
  assert.ok(parseGetArgs, 'Разбор аргументов get должен существовать')
  assert.deepEqual(parseGetArgs(['ABC-1']), { key: 'ABC-1', withDescription: false })
  for (const args of [[], ['no-key'], ['ABC-1', 'ABC-2'], ['ABC-1', '--dry-run']]) {
    assert.throws(() => parseGetArgs(args), CliError)
  }
})

test('G1 I1: статус и исполнитель', async () => {
  issue({ status: 'Тестирование', assignee: 'petrov' })
  const response = await sandbox(fake).run(['get', KEY])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { key: KEY, url: `${fake.url}/browse/${KEY}`, title: 'Задача', issueStatus: 'Тестирование', assignee: 'petrov' })
  assert.equal(fake.state.transitions, 0)
  assert.equal(fake.state.assignments, 0)
})

test('G1 I2: неназначенная задача — assignee null', async () => {
  issue()
  const response = await sandbox(fake).run(['get', KEY])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { key: KEY, url: `${fake.url}/browse/${KEY}`, title: 'Задача', issueStatus: 'Open', assignee: null })
})

test('G1 I3: карточка не найдена — код 3', async () => {
  const response = await sandbox(fake).run(['get', 'ABC-99'])

  assert.equal(response.code, 3, response.stderr)
  assert.match(response.stderr, /не найдена/)
  assert.equal(response.stdout, '')
})

test('G2 U1: флаг --with-description', () => {
  const parseGetArgs = (argsModule as typeof argsModule & { parseGetArgs: (argv: string[]) => { key: string; withDescription: boolean } }).parseGetArgs
  assert.deepEqual(parseGetArgs(['ABC-1', '--with-description']), { key: 'ABC-1', withDescription: true })
})

test('G2 I1: --with-description отдаёт описание и ничего не сохраняет', async () => {
  issue({ description: 'Текст *жирный*' })
  const response = await sandbox(fake).run(['get', KEY, '--with-description'])

  assert.equal(response.code, 0, response.stderr)
  const result = JSON.parse(response.stdout)
  assert.equal(result.description, 'Текст *жирный*')
  assert.equal(result.title, 'Задача')
  assert.equal(fake.state.editSaves, 0)
})
