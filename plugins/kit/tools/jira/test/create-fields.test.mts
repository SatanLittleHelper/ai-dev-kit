import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CREATE, sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()

async function notFoundCase(flags: string[], pattern: RegExp): Promise<void> {
  const result = await sandbox(fake).run([...CREATE, ...flags])
  assert.equal(result.code, 3, result.stderr)
  assert.match(result.stderr, pattern)
  assert.equal(result.stdout, '')
  assert.equal(fake.state.submits, 0)
  assert.equal(fake.state.issues.length, 0)
}

test('E10: исполнитель me — текущий пользователь', async () => {
  const result = await sandbox(fake).run([...CREATE, '--assignee', 'me'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fake.state.issues[0].assignee, 'ivanov')
})

test('E11: исполнитель по логину', async () => {
  const result = await sandbox(fake).run([...CREATE, '--assignee', 'petrov'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fake.state.issues[0].assignee, 'petrov')
})

test('E12: исполнитель не найден — код 3, Create не нажат', async () => {
  await notFoundCase(['--assignee', 'nobody'], /Исполнитель.*nobody/)
})

test('E13: родитель не найден — код 3, Create не нажат', async () => {
  await notFoundCase(['--parent', 'ABC-999'], /Родитель.*ABC-999/)
})

test('E14: спринт не найден — код 3, Create не нажат', async () => {
  await notFoundCase(['--sprint', 'Нет такого'], /Спринт.*Нет такого/)
})

test('E15: тип задачи не найден — код 3, Create не нажат', async () => {
  await notFoundCase(['--type', 'Nope'], /Тип задачи.*Nope/)
})

test('E16: родитель заполняется', async () => {
  const result = await sandbox(fake).run([...CREATE, '--parent', 'ABC-12'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fake.state.issues[0].parent, 'ABC-12')
})

test('E17: спринт заполняется', async () => {
  const result = await sandbox(fake).run([...CREATE, '--sprint', 'Спринт 5'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fake.state.issues[0].sprint, 'Спринт 5')
})
