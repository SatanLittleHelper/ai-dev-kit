import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CREATE, sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()

test('E4: при сбое stdout пуст, ошибка в stderr', async () => {
  fake.state.failMode = 'noKey'
  const result = await sandbox(fake).run(CREATE)
  assert.equal(result.code, 5)
  assert.equal(result.stdout, '')
  assert.ok(result.stderr.trim().length > 0)
})

test('E18: ключ не получен после Create — код 5, Create нажат один раз', async () => {
  fake.state.failMode = 'noKey'
  const result = await sandbox(fake).run(CREATE)
  assert.equal(result.code, 5)
  assert.match(result.stderr, /Состояние неизвестно/)
  assert.equal(fake.state.submits, 1)
})

test('E19: Jira показала ошибку после Create — код 5, Create нажат один раз', async () => {
  fake.state.failMode = 'error'
  const result = await sandbox(fake).run(CREATE)
  assert.equal(result.code, 5)
  assert.equal(result.stdout, '')
  assert.equal(fake.state.submits, 1)
})

test('E20: задача создана, но /browse/KEY не открывается — успех с предупреждением, Create нажат один раз', async () => {
  fake.state.hideBrowse = true
  const result = await sandbox(fake).run(CREATE)
  assert.equal(result.code, 0)
  assert.match(result.stdout, /"key"/)
  assert.match(result.stderr, /Предупреждение: задача .* создана/)
  assert.equal(fake.state.submits, 1)
})

test('E23: сбой самого нажатия Create — код 5', async () => {
  fake.state.disableSubmit = true
  const result = await sandbox(fake).run([...CREATE])
  assert.equal(result.code, 5)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Состояние неизвестно/)
})
