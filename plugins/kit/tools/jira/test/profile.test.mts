import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { CliError, EXIT } from '../src/errors.mts'
import { ensurePlaywright, jiraHome, lockPath, npmInstallArgs, PLAYWRIGHT_VERSION, profilePath, withLock } from '../src/profile.mts'

const tempHome = () => mkdtempSync(join(tmpdir(), 'jira-profile-'))
const HOST = 'jira.company.ru'

test('U12: путь профиля зависит от хоста Jira', () => {
  const home = tempHome()
  assert.notEqual(profilePath(home, 'jira.a.ru'), profilePath(home, 'jira.b.ru'))
  assert.equal(profilePath(home, 'jira.a.ru'), join(home, 'jira.a.ru', 'profile'))
  assert.equal(profilePath(home, 'jira.a.ru'), profilePath(home, 'jira.a.ru'))
  assert.equal(profilePath(home, '127.0.0.1:8080'), join(home, '127.0.0.1_8080', 'profile'))
  assert.ok(jiraHome({}).endsWith(join('.config', 'ai-dev-kit', 'jira')))
  assert.equal(jiraHome({ JIRA_HOME: '/x' }), '/x')
})

test('U13: блокировка существует, пока выполняется действие', async () => {
  const home = tempHome()
  const content = await withLock(home, HOST, async () => readFileSync(lockPath(home, HOST), 'utf8'))
  assert.equal(content, String(process.pid))
})

test('U14: блокировка снята после успешного действия', async () => {
  const home = tempHome()
  await withLock(home, HOST, async () => 'ok')
  assert.equal(existsSync(lockPath(home, HOST)), false)
  await withLock(home, HOST, async () => 'again')
})

test('U15: блокировка снята после ошибки в действии', async () => {
  const home = tempHome()
  await assert.rejects(withLock(home, HOST, async () => { throw new Error('boom') }), /boom/)
  assert.equal(existsSync(lockPath(home, HOST)), false)
})

test('U16: профиль занят живым процессом — код 4', async () => {
  const home = tempHome()
  mkdirSync(dirname(lockPath(home, HOST)), { recursive: true })
  writeFileSync(lockPath(home, HOST), String(process.pid))
  await assert.rejects(
    withLock(home, HOST, async () => 'never'),
    (error: unknown) => error instanceof CliError && error.code === EXIT.LOCKED && /занят/.test(error.message),
  )
  assert.equal(readFileSync(lockPath(home, HOST), 'utf8'), String(process.pid))
})

test('U17: lock завершившегося процесса не блокирует', async () => {
  const home = tempHome()
  const deadPid = spawnSync(process.execPath, ['-e', '']).pid
  mkdirSync(dirname(lockPath(home, HOST)), { recursive: true })
  writeFileSync(lockPath(home, HOST), String(deadPid))
  const content = await withLock(home, HOST, async () => readFileSync(lockPath(home, HOST), 'utf8'))
  assert.equal(content, String(process.pid))
})

test('U26: playwright-core отсутствует — устанавливается в каталог профилей, не в проект', () => {
  const home = tempHome()
  const installed: string[] = []
  ensurePlaywright(home, dir => installed.push(dir))
  assert.deepEqual(installed, [home])
})

test('U27: playwright-core уже стоит — установка не запускается', () => {
  const home = tempHome()
  mkdirSync(join(home, 'node_modules', 'playwright-core'), { recursive: true })
  writeFileSync(join(home, 'node_modules', 'playwright-core', 'package.json'), '{}')
  const installed: string[] = []
  ensurePlaywright(home, dir => installed.push(dir))
  assert.deepEqual(installed, [])
})

test('U34: рантайм ставит playwright-core закреплённой версии, совпадающей с devDependency', () => {
  assert.deepEqual(npmInstallArgs('/x'), ['install', '--prefix', '/x', `playwright-core@${PLAYWRIGHT_VERSION}`, '--no-audit', '--no-fund'])
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.devDependencies['playwright-core'], PLAYWRIGHT_VERSION)
})
