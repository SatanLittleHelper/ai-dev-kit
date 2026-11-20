import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = new URL('../sync-codex.sh', import.meta.url).pathname

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'forgejo-sync-'))
  const tool = join(root, 'tools', 'forgejo')
  const codex = join(root, 'codex', 'forgejo')
  for (const [file, text] of [['src/a.mts', 'a'], ['cli/main.mts', 'm'], ['test/fake.mts', 'fake'], ['test/a.test.mts', 'test'], ['test/fixtures/x.json', '{}']]) {
    mkdirSync(join(tool, file, '..'), { recursive: true })
    writeFileSync(join(tool, file), text)
  }
  const sync = (...args: string[]) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, FORGEJO_SYNC_SRC: tool, FORGEJO_SYNC_CODEX: codex } })
  return { tool, root, codex, sync }
}

test('U28: синхронизация копирует только src/ и cli/ в Codex-плагин', () => {
  const { root, codex, sync } = sandbox()
  assert.equal(sync().status, 0)
  assert.deepEqual(readdirSync(codex).sort(), ['cli', 'src'])
  assert.equal(readFileSync(join(codex, 'src', 'a.mts'), 'utf8'), 'a')
  assert.equal(readFileSync(join(codex, 'cli', 'main.mts'), 'utf8'), 'm')
  assert.equal(existsSync(join(root, 'plugins')), false)
})

test('U29: после синхронизации проверка проходит', () => {
  const { sync } = sandbox()
  assert.equal(sync().status, 0)
  assert.equal(sync('--check').status, 0)
})

test('U30: правка копии ломает проверку', () => {
  const { codex, sync } = sandbox()
  assert.equal(sync().status, 0)
  appendFileSync(join(codex, 'src', 'a.mts'), 'edited')
  const result = sync('--check')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /a\.mts/)
  assert.match(result.stderr, /sync-codex\.sh/)
})

test('U31: правка источника без синхронизации ломает проверку', () => {
  const { tool, sync } = sandbox()
  assert.equal(sync().status, 0)
  appendFileSync(join(tool, 'src', 'a.mts'), 'changed')
  const result = sync('--check')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /a\.mts/)
  assert.match(result.stderr, /sync-codex\.sh/)
})

test('U32: лишний файл в каталоге Codex-плагина ломает проверку', () => {
  const { codex, sync } = sandbox()
  assert.equal(sync().status, 0)
  writeFileSync(join(codex, 'extra.txt'), 'x')
  const result = sync('--check')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /extra\.txt/)
})

test('U33: реальная копия в pr-flow-codex совпадает с источником', () => {
  const result = spawnSync('bash', [SCRIPT, '--check'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
