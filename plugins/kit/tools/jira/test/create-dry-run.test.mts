import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CREATE, sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()

test('E21: --dry-run заполняет форму, но Create не нажимает', async () => {
  const result = await sandbox(fake).run([...CREATE, '--dry-run', '--type', 'Task', '--assignee', 'me'])
  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.trim().split('\n')
  assert.equal(lines.length, 1)
  assert.deepEqual(JSON.parse(lines[0]), { dryRun: true, project: 'ABC', type: 'Task', title: 'Заголовок задачи' })
  assert.equal(fake.state.submits, 0)
  assert.equal(fake.state.issues.length, 0)
})

test('E22: --dry-run тоже падает на ненайденном значении поля', async () => {
  const result = await sandbox(fake).run([...CREATE, '--dry-run', '--project', 'ZZZ'])
  assert.equal(result.code, 3, result.stderr)
  assert.match(result.stderr, /проект/i)
  assert.equal(result.stdout, '')
  assert.equal(fake.state.submits, 0)
})

test('E23: jira.dryRun в конфиге включает пробный запуск без флага и подсказывает про --no-dry-run', async () => {
  const result = await sandbox(fake, { jira: { dryRun: true } }).run(CREATE)
  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout.trim()), { dryRun: true, project: 'ABC', type: 'Task', title: 'Заголовок задачи' })
  assert.match(result.stderr, /jira\.dryRun.*--no-dry-run/)
  assert.equal(fake.state.submits, 0)
})

test('E24: --no-dry-run перекрывает jira.dryRun — задача создаётся', async () => {
  const result = await sandbox(fake, { jira: { dryRun: true } }).run([...CREATE, '--no-dry-run'])
  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout.trim()), { key: 'ABC-1', url: `${fake.url}/browse/ABC-1` })
  assert.equal(fake.state.issues.length, 1)
})

test('E25: явный --dry-run при jira.dryRun не выводит подсказку про настройку', async () => {
  const result = await sandbox(fake, { jira: { dryRun: true } }).run([...CREATE, '--dry-run'])
  assert.equal(result.code, 0, result.stderr)
  assert.doesNotMatch(result.stderr, /jira\.dryRun/)
  assert.equal(fake.state.submits, 0)
})
