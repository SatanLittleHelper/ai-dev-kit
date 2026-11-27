import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const DIR = new URL('../plugins/kit/skills/roadmap/', import.meta.url).pathname
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]))
const text = () => files(DIR).filter((file) => file.endsWith('.md')).map((file) => readFileSync(file, 'utf8')).join('\n')

test('R1: процедуры, которые делает инструмент, не описаны в тексте скилла', () => {
  const all = text()
  for (const forbidden of ['git sparse-checkout set', 'gh pr list', 'git rev-list', 'git switch -c', 'git show origin/', 'pr files <N>']) {
    assert.equal(all.includes(forbidden), false, `в тексте скилла осталось «${forbidden}»`)
  }
})

test('R2: скилл вызывает инструмент roadmap и его команды', () => {
  const all = text()
  assert.match(all, /tools\/roadmap\/cli\/main\.mts/)
  for (const command of ['status', 'pick', 'close', 'mark', 'create', 'validate', 'estimate', 'tickets', 'link']) {
    assert.match(all, new RegExp(`roadmap[^\\n]{0,40}\\b${command}\\b|main\\.mts ${command}\\b`), `нет команды ${command}`)
  }
})

test('R3: есть reference про Jira-тикеты и ссылка на него из writing.md', () => {
  assert.match(readFileSync(join(DIR, 'references/writing.md'), 'utf8'), /references\/jira-tickets\.md/)
  assert.match(readFileSync(join(DIR, 'references/jira-tickets.md'), 'utf8'), /create-roadmap/)
})

test('R4: правило потолка шага в скилле прежнее — manual ≤ 3д, с возможностью limit', () => {
  const skill = readFileSync(join(DIR, 'SKILL.md'), 'utf8')
  assert.match(skill, /manual\.max ≤ 3д/)
  assert.match(skill, /limit/)
})
