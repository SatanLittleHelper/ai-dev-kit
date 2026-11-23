import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTransitionArgs } from '../cli/args.mts'
import { CliError } from '../src/errors.mts'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()

test('F1 U28: --to review разбирается', () => {
  assert.deepEqual(parseTransitionArgs(['ABC-1', '--to', 'review']), { key: 'ABC-1', dryRun: undefined, target: 'review' })
})

test('F1 U29: неизвестный статус в --to отклоняется', () => {
  assert.throws(() => parseTransitionArgs(['ABC-1', '--to', 'nowhere']), (error: unknown) => error instanceof CliError && /review/.test(error.message))
  assert.throws(() => parseTransitionArgs(['ABC-1', '--to']), CliError)
})

test('F1 U30: без --to целевой статус «В работе»', () => {
  assert.deepEqual(parseTransitionArgs(['ABC-1']), { key: 'ABC-1', dryRun: undefined, target: 'in-progress' })
})

test('F1 I1: переход в «Ревью» на поддельной Jira', async () => {
  fake.state.issues.push({ key: 'ABC-42', project: 'ABC', type: 'Task', summary: 'Задача', description: '', status: 'Open' })
  fake.state.transitionLayout = 'menu'
  fake.state.transitionOptions = [
    { label: 'test', destination: 'В работе' },
    { label: 'На ревью', destination: 'Ревью' },
  ]

  const response = await sandbox(fake, { jira: {} }).run(['transition', 'ABC-42', '--to', 'review', '--no-dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { key: 'ABC-42', url: `${fake.url}/browse/ABC-42`, status: 'transitioned', issueStatus: 'Ревью' })
  assert.equal(fake.state.transitions, 1)
})
