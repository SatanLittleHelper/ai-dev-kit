import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CREATE, sandbox, useFakeJira } from './support.mts'
import { lockPath } from '../src/profile.mts'

const fake = useFakeJira()

test('E3: успешное создание возвращает ключ и ссылку', async () => {
  const result = await sandbox(fake).run([...CREATE, '--type', 'Task'])
  assert.equal(result.code, 0, result.stderr)
  const lines = result.stdout.trim().split('\n')
  assert.equal(lines.length, 1)
  assert.deepEqual(JSON.parse(lines[0]), { key: 'ABC-1', url: `${fake.url}/browse/ABC-1` })
  assert.equal(fake.state.issues.length, 1)
  const issue = fake.state.issues[0]
  assert.deepEqual([issue.project, issue.type, issue.summary], ['ABC', 'Task', 'Заголовок задачи'])
})

test('E5: протухшая сессия — код 2, задача не создаётся', async () => {
  fake.state.loggedIn = false
  const result = await sandbox(fake).run(CREATE)
  assert.equal(result.code, 2)
  assert.match(result.stderr, /jira login/)
  assert.equal(fake.state.issues.length, 0)
})

test('E6: профиль занят — код 4, браузер не запускается', async () => {
  const box = sandbox(fake)
  const lock = lockPath(box.home, new URL(fake.url).host)
  mkdirSync(dirname(lock), { recursive: true })
  writeFileSync(lock, String(process.pid))
  const result = await box.run(CREATE)
  assert.equal(result.code, 4)
  assert.equal(result.stdout, '')
  assert.equal(fake.state.issues.length, 0)
})

test('E7: проект выбирается по точному совпадению ключа', async () => {
  const result = await sandbox(fake).run([...CREATE, '--project', 'ABC'])
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fake.state.issues[0].project, 'ABC')
})

test('E8: проект не найден — код 3, Create не нажат', async () => {
  const result = await sandbox(fake).run([...CREATE, '--project', 'ZZZ'])
  assert.equal(result.code, 3)
  assert.match(result.stderr, /проект/i)
  assert.equal(fake.state.submits, 0)
  assert.equal(fake.state.issues.length, 0)
})

test('E9: описание вводится в режиме Wiki Markup', async () => {
  const body = 'h3. Контекст\n* пункт'
  const result = await sandbox(fake, { body }).run(CREATE)
  assert.equal(result.code, 0, result.stderr)
  assert.equal(fake.state.issues[0].description, body)
})
