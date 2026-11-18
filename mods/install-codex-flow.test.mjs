import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

function fixture(t, config = 'model = "gpt-x"\n') {
  const root = mkdtempSync(join(tmpdir(), 'codex-install-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, 'project'), bin = join(root, 'bin')
  mkdirSync(join(cwd, '.codex'), { recursive: true })
  mkdirSync(bin)
  assert.equal(spawnSync('git', ['init', '-q'], { cwd }).status, 0)
  const file = join(cwd, '.codex/config.toml')
  writeFileSync(file, config)
  const catalog = JSON.parse(readFileSync('.agents/plugins/marketplace.json', 'utf8'))
  for (const plugin of catalog.plugins.filter(p => typeof p.source === 'string')) {
    if (existsSync(join(plugin.source, '.codex-plugin/plugin.json'))) {
      cpSync(plugin.source, join(root, 'available', plugin.name), { recursive: true })
    }
  }
  writeFileSync(join(bin, 'codex'), [
    '#!/bin/sh',
    'case "$*" in',
    '  "plugin marketplace list --json") echo \'["ai-dev-kit"]\';;',
    '  "plugin marketplace upgrade ai-dev-kit") touch "$PR_CACHE/.refreshed";;',
    '  "plugin add pr-flow@ai-dev-kit")',
    '    test -f "$PR_CACHE/.refreshed" && cp -R "$PR_AVAILABLE/pr-flow/." "$PR_CACHE";;',
    '  "plugin add kit@ai-dev-kit") exit 0;;',
    '  *) exit 1;;',
    'esac',
  ].join('\n'), { mode: 0o755 })
  const cache = join(root, 'cache')
  mkdirSync(cache)
  const kit = join(cwd, '.claude/ai-dev-kit')
  mkdirSync(kit, { recursive: true })
  for (const dir of ['mods', 'rules']) cpSync(dir, join(kit, dir), { recursive: true })
  for (const file of ['mods/install-mods.sh', 'mods/migrate-legacy-skills.sh',
    'dependencies/install.sh', 'defaults/install-dev-conventions.sh']) {
    const path = join(kit, file)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, '#!/bin/sh\nexit 0\n')
  }
  writeFileSync(join(cwd, '.codex-test-answer'), 'y\n')
  const setup = readFileSync('setup.sh', 'utf8').replaceAll('/dev/tty', '.codex-test-answer')
  writeFileSync(join(cwd, 'setup.sh'), setup)
  const env = { ...process.env, PATH: bin + ':' + process.env.PATH,
    PR_AVAILABLE: join(root, 'available'), PR_CACHE: cache }
  return {
    cache,
    setup: () => spawnSync('bash', ['setup.sh'], { cwd, env, encoding: 'utf8', timeout: 10_000 }),
    read: () => readFileSync(file, 'utf8'),
    run: () => spawnSync('bash', [resolve('mods/install-codex-plugins.sh'), 'kit'],
      { cwd, env, encoding: 'utf8' }),
  }
}
const section = '[plugins."pr-flow@ai-dev-kit"]'
test('U17: сохраняется явное отключение', t => {
  const f = fixture(t, 'model = "gpt-x"\n\n' + section + '\nenabled = false\n')
  assert.equal(f.run().status, 0)
  assert.ok(f.read().includes(section + '\nenabled = false'))
  assert.ok(f.read().includes('model = "gpt-x"'))
})
test('U18: повтор не дублирует запись PR-flow', t => {
  const f = fixture(t)
  assert.equal(f.run().status, 0)
  const first = f.read()
  assert.equal(f.run().status, 0)
  assert.equal(f.read(), first)
  assert.equal(first.split(section).length, 2)
})
test('U19: установка kit доставляет навык PR-flow и сохраняет настройки', t => {
  const f = fixture(t)
  const result = f.setup()
  assert.equal(result.status, 0, result.error?.message ?? result.stdout + result.stderr)
  assert.ok(f.read().includes('model = "gpt-x"'))
  assert.ok(f.read().includes(section + '\nenabled = true'))
  assert.ok(existsSync(join(f.cache, 'skills/pr-flow/SKILL.md')))
})
