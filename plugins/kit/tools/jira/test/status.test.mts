import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()

test('E1: status — живая сессия, код 0', async () => {
  const result = await sandbox(fake).run(['status'])
  assert.equal(result.code, 0, result.stderr)
})

test('E2: status — редирект на вход, код 2', async () => {
  fake.state.loggedIn = false
  const result = await sandbox(fake).run(['status'])
  assert.equal(result.code, 2)
  assert.match(result.stderr, /jira login/)
})
