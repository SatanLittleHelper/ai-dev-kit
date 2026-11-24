import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTransitionArgs } from '../cli/args.mts'
import { CliError } from '../src/errors.mts'
import { sandbox, useFakeJira } from './support.mts'

test('T1 U1: --to testing разбирается', () => {
  assert.deepEqual(parseTransitionArgs(['ABC-1', '--to', 'testing']), { key: 'ABC-1', dryRun: undefined, target: 'testing' })
})

test('T1 U2: --assignee разбирается вместе с --to', () => {
  assert.deepEqual(
    parseTransitionArgs(['ABC-1', '--to', 'testing', '--assignee', 'petrov@example.com', '--no-dry-run']),
    { key: 'ABC-1', dryRun: false, target: 'testing', assignee: 'petrov@example.com' },
  )
})

test('T1 U3: --assignee без значения или не email отклоняется', () => {
  for (const args of [['ABC-1', '--assignee'], ['ABC-1', '--assignee', '--dry-run'], ['ABC-1', '--assignee', 'petrov']]) {
    assert.throws(() => parseTransitionArgs(args), (error: unknown) => error instanceof CliError && /email/.test(error.message))
  }
})

const fake = useFakeJira()
const KEY = 'ABC-42'
const TESTER = 'petrov@example.com'

function issue(status = 'Open'): void {
  fake.state.issues.push({ key: KEY, project: 'ABC', type: 'Task', summary: 'Задача', description: '', status })
  fake.state.transitionLayout = 'menu'
  fake.state.transitionOptions = [{ label: 'На тестирование', destination: 'Тестирование' }]
}

const transition = (...flags: string[]) => sandbox(fake).run(['transition', KEY, '--to', 'testing', ...flags])

test('T2 I1: переход в «Тестирование» и назначение тестировщика', async () => {
  issue()
  const response = await transition('--assignee', TESTER, '--no-dry-run')

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), {
    key: KEY, url: `${fake.url}/browse/${KEY}`, status: 'transitioned', issueStatus: 'Тестирование', assignee: TESTER,
  })
  assert.equal(fake.state.transitions, 1)
  assert.equal(fake.state.assignments, 1)
  assert.equal(fake.state.issues[0].assignee, 'petrov')
})

test('T2 I2: задача уже в «Тестировании» — только назначение', async () => {
  issue('Тестирование')
  const response = await transition('--assignee', TESTER, '--no-dry-run')

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), {
    key: KEY, url: `${fake.url}/browse/${KEY}`, status: 'already-in-testing', issueStatus: 'Тестирование', assignee: TESTER,
  })
  assert.equal(fake.state.transitions, 0)
  assert.equal(fake.state.issues[0].assignee, 'petrov')
})

test('T2 I3: без --assignee исполнитель не меняется и в ответе нет поля assignee', async () => {
  issue()
  const response = await transition('--no-dry-run')

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), {
    key: KEY, url: `${fake.url}/browse/${KEY}`, status: 'transitioned', issueStatus: 'Тестирование',
  })
  assert.equal(fake.state.assignments, 0)
})

test('T2 I4: пользователь не найден — код 3, статус уже изменён, об этом сказано', async () => {
  issue()
  const response = await transition('--assignee', 'nobody@example.com', '--no-dry-run')

  assert.equal(response.code, 3, response.stderr)
  assert.match(response.stderr, /Исполнитель.*не найдено/)
  assert.match(response.stderr, /повторная команда только назначит исполнителя/)
  assert.equal(response.stdout, '')
  assert.equal(fake.state.transitions, 1)
  assert.equal(fake.state.assignments, 0)
})

test('T2 I5: пробный запуск ничего не меняет, в ответе есть исполнитель', async () => {
  issue()
  const response = await transition('--assignee', TESTER, '--dry-run')

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), {
    key: KEY, url: `${fake.url}/browse/${KEY}`, status: 'dry-run', issueStatus: 'Open', assignee: TESTER,
  })
  assert.equal(fake.state.transitions, 0)
  assert.equal(fake.state.assignments, 0)
})

test('T2 I3: назначение по точному email, а не по вхождению', async () => {
  issue('Тестирование')
  fake.state.users.unshift({ login: 'ivan.petrov', name: 'Иван Петров', email: `ivan.${TESTER}` })
  const response = await transition('--assignee', TESTER, '--no-dry-run')

  assert.equal(response.code, 0, response.stderr)
  assert.equal(fake.state.issues[0].assignee, 'petrov')
})

test('T2 I4: нет пользователя с точно таким email — не найдено', async () => {
  issue('Тестирование')
  fake.state.users = [{ login: 'petrov', name: 'Пётр Петров', email: 'petrov@other.com' }]
  const response = await transition('--assignee', TESTER, '--no-dry-run')

  assert.equal(response.code, 3)
  assert.equal(fake.state.assignments, 0)
})
