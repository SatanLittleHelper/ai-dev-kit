import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CREATE, sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()

test('CL1: тело с {{a.b}} — код 1, в Jira ничего не уходит', async () => {
  const response = await sandbox(fake, { body: 'Файл {{a.b}} тут' }).run(CREATE)

  assert.equal(response.code, 1)
  assert.match(response.stderr, /inline-code/)
  assert.equal(fake.state.submits, 0)
})

test('CL2: название с тремя префиксами — код 1', async () => {
  const response = await sandbox(fake, { title: '[а] [б] [в] Название' }).run(CREATE)

  assert.equal(response.code, 1)
  assert.match(response.stderr, /title-prefixes/)
  assert.equal(fake.state.submits, 0)
})

test('CL3: минимальное тело `h3. Контекст` + пункт по-прежнему создаётся', async () => {
  const response = await sandbox(fake).run(CREATE)

  assert.equal(response.code, 0, response.stderr)
  assert.equal(fake.state.submits, 1)
})
