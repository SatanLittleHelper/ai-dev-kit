import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeRepo, roadmap, ROADMAP } from './support.mts'

const state = JSON.stringify({ feature: 'x', roadmapPath: '', updatedAt: 'x', steps: [{ id: 'A1', title: 'A1', ticket: 'TBD', dependsOn: [], estimate: null, stepFolder: null, status: 'spec-drafted', specPath: null, testPlanPath: null, planPath: null }, { id: 'B1', title: 'B1', ticket: 'TBD', dependsOn: [], estimate: null, stepFolder: null, status: 'not-started', specPath: null, testPlanPath: null, planPath: null }] })

test('M1: повышение статуса с путём спеки', () => {
  const { work } = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': ROADMAP, 'docs/x/roadmap-state.json': state })
  const response = roadmap(work, {}, 'mark', 'A1', '--status', 'spec-validated', '--spec', 'docs/x/steps/a/spec.md')
  assert.equal(response.json.result, 'ok', response.stdout)
  const saved = JSON.parse(readFileSync(join(work, 'docs/x/roadmap-state.json'), 'utf8'))
  assert.deepEqual([saved.steps[0].status, saved.steps[0].specPath], ['spec-validated', 'docs/x/steps/a/spec.md'])
})

test('M2: понижение, closed и неизвестный статус — blocked', () => {
  const { work } = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': ROADMAP, 'docs/x/roadmap-state.json': state })
  assert.equal(roadmap(work, {}, 'mark', 'A1', '--status', 'not-started').json.result, 'blocked')
  assert.equal(roadmap(work, {}, 'mark', 'A1', '--status', 'closed').json.result, 'blocked')
  assert.equal(roadmap(work, {}, 'mark', 'A1', '--status', 'nope').json.result, 'blocked')
})
