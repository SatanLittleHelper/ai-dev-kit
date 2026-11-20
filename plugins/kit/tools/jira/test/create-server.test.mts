import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CREATE, sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()

function useServerFlavor(): void {
  fake.state.flavor = 'server'
  fake.state.types = ['Задача', 'Ошибка']
}

test('S1: русская Jira Server — задача создаётся, успешный флаг с role=alert не считается ошибкой', async () => {
  useServerFlavor()
  const body = 'h3. Контекст\n* пункт'
  const result = await sandbox(fake, { body }).run([...CREATE, '--type', 'Задача', '--assignee', 'me'])
  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout.trim()), { key: 'ABC-1', url: `${fake.url}/browse/ABC-1` })
  const issue = fake.state.issues[0]
  assert.deepEqual([issue.project, issue.type, issue.summary, issue.description, issue.assignee], ['ABC', 'Задача', 'Заголовок задачи', body, 'ivanov'])
})

test('S2: редактор открыт в визуальном режиме — описание вводится в режиме Текст', async () => {
  useServerFlavor()
  fake.state.serverVisualEditor = true
  const body = 'h3. Контекст\n* пункт'
  const result = await sandbox(fake, { body }).run([...CREATE, '--type', 'Ошибка'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fake.state.issues[0].description, body)
})

test('S3: исполнитель выбирается по логину из подсказок', async () => {
  useServerFlavor()
  const result = await sandbox(fake).run([...CREATE, '--type', 'Задача', '--assignee', 'petrov'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fake.state.issues[0].assignee, 'petrov')
})

test('S4: тип не найден — код 3, Create не нажат', async () => {
  useServerFlavor()
  const result = await sandbox(fake).run([...CREATE, '--type', 'Эпик'])
  assert.equal(result.code, 3)
  assert.match(result.stderr, /тип/i)
  assert.equal(fake.state.submits, 0)
})

test('S5: проект не найден — код 3, Create не нажат', async () => {
  useServerFlavor()
  const result = await sandbox(fake).run([...CREATE, '--type', 'Задача', '--project', 'ZZZ'])
  assert.equal(result.code, 3)
  assert.equal(fake.state.submits, 0)
})
