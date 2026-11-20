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
