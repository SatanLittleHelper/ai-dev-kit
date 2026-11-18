import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('U16: обнаруживает расхождение', t => {
  const root = mkdtempSync(join(tmpdir(), 'pr-flow-sync-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const script = 'plugins/pr-flow-codex/scripts'
  mkdirSync(join(root, script), { recursive: true })
  cpSync('mods/pr-flow/hooks', join(root, 'mods/pr-flow/hooks'), { recursive: true })
  cpSync(script + '/sync.mjs', join(root, script, 'sync.mjs'))
  const run = (...args) => spawnSync(process.execPath,
    [join(root, script, 'sync.mjs'), ...args], { encoding: 'utf8' })
  assert.equal(run().status, 0)
  assert.equal(run('--check').status, 0)
  appendFileSync(join(root, 'plugins/pr-flow-codex/hooks/shared/commands.ts'), '\n// drift\n')
  const result = run('--check')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /отличаются/)
})
