import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeRepo, roadmap, ROADMAP, write } from './support.mts'

const state = JSON.stringify({ feature: 'x', roadmapPath: '', updatedAt: 'x', steps: ['A1', 'B1'].map(id => ({ id, title: id, ticket: 'TBD', dependsOn: [], estimate: null, stepFolder: null, status: 'not-started', specPath: null, testPlanPath: null, planPath: null })) })
const created = JSON.stringify({ story: { key: 'ABC-1', url: 'http://j/ABC-1' }, children: { A1: { key: 'ABC-2', url: 'http://j/ABC-2' }, B1: { key: 'ABC-3', url: 'http://j/ABC-3' } }, unknown: null })

function repo(): { work: string } {
  const made = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': ROADMAP, 'docs/x/roadmap-state.json': state })
  write(made.work, 'tmp/drafts/x-tickets.created.json', created)
  return made
}

test('LK1: ключи попадают в строки роадмапа, состояние и стори', () => {
  const { work } = repo()
  const response = roadmap(work, {}, 'link', 'x', '--from', 'tmp/drafts/x-tickets.created.json')
  assert.equal(response.json.result, 'ok', response.stdout)
  const text = readFileSync(join(work, 'docs/x/2026-01-01-x-roadmap.md'), 'utf8')
  assert.match(text, /- \[ \] A1 — Первый шаг \(Jira: ABC-2\) \(est:/)
  assert.match(text, /- \[ \] B1 — Второй шаг \(Jira: ABC-3\) \(est:/)
  assert.match(text, /^# Роадмап: Пример\nJira: ABC-1\n/m)
  const saved = JSON.parse(readFileSync(join(work, 'docs/x/roadmap-state.json'), 'utf8'))
  assert.deepEqual(saved.steps.map((step: { ticket: string }) => step.ticket), ['ABC-2', 'ABC-3'])
  assert.deepEqual(saved.story, { key: 'ABC-1', url: 'http://j/ABC-1' })
})

test('LK2: повторный link идемпотентен; другой ключ — needs-input без записи', () => {
  const { work } = repo()
  roadmap(work, {}, 'link', 'x', '--from', 'tmp/drafts/x-tickets.created.json')
  const again = roadmap(work, {}, 'link', 'x', '--from', 'tmp/drafts/x-tickets.created.json')
  assert.equal(again.json.result, 'ok')
  assert.equal((readFileSync(join(work, 'docs/x/2026-01-01-x-roadmap.md'), 'utf8').match(/^Jira: ABC-1$/gm) ?? []).length, 1)
  write(work, 'tmp/drafts/x-tickets.created.json', created.replace('ABC-2', 'ABC-9'))
  const conflict = roadmap(work, {}, 'link', 'x', '--from', 'tmp/drafts/x-tickets.created.json')
  assert.equal(conflict.code, 2)
  assert.match(readFileSync(join(work, 'docs/x/2026-01-01-x-roadmap.md'), 'utf8'), /Jira: ABC-2/)
})
