import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = new URL('../sync-skills.sh', import.meta.url).pathname
const SKILLS = ['forgejo-pr-dashboard', 'forgejo-pr-feedback']

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'forgejo-sync-'))
  const tool = join(root, 'tools', 'forgejo')
  const skills = join(root, 'skills')
  for (const [file, text] of [['src/a.mts', 'a'], ['cli/main.mts', 'm'], ['test/fake.mts', 'fake'], ['test/a.test.mts', 'test'], ['test/fixtures/x.json', '{}']]) {
    mkdirSync(join(tool, file, '..'), { recursive: true })
    writeFileSync(join(tool, file), text)
  }
  const sync = (...args: string[]) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, FORGEJO_SYNC_SRC: tool, FORGEJO_SYNC_SKILLS: skills } })
  return { tool, skills, sync }
}

test('U61: синхронизация копирует src/ и cli/ в scripts/ обоих скиллов без тестов и фикстур', () => {
  const { skills, sync } = sandbox()
  assert.equal(sync().status, 0)
  for (const skill of SKILLS) {
    const scripts = join(skills, skill, 'scripts')
    assert.deepEqual(readdirSync(scripts).sort(), ['cli', 'src'])
    assert.equal(readFileSync(join(scripts, 'src', 'a.mts'), 'utf8'), 'a')
    assert.equal(readFileSync(join(scripts, 'cli', 'main.mts'), 'utf8'), 'm')
  }
  assert.equal(sync('--check').status, 0)
})

test('U62: проверка расхождения падает при правке копии и при изменении источника без синхронизации', () => {
  const { tool, skills, sync } = sandbox()
  assert.equal(sync().status, 0)
  appendFileSync(join(skills, SKILLS[0], 'scripts', 'src', 'a.mts'), 'edited')
  const edited = sync('--check')
  assert.notEqual(edited.status, 0)
  assert.match(edited.stderr, /a\.mts/)
  assert.match(edited.stderr, /sync-skills\.sh/)

  assert.equal(sync().status, 0)
  appendFileSync(join(tool, 'src', 'a.mts'), 'changed')
  const stale = sync('--check')
  assert.notEqual(stale.status, 0)
  assert.match(stale.stderr, /a\.mts/)
})

test('U63: реальные scripts/ скиллов в репозитории совпадают с источником', () => {
  const result = spawnSync('bash', [SCRIPT, '--check'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
