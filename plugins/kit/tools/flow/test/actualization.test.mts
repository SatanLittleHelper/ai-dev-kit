import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { run } from '../cli/run.mts'
import { begin, closeThrough, initTestRepository, readStateFile, tempRoot } from './support.mts'
import { seedRules } from './rules-support.mts'
import { stubRunners } from './runners-support.mts'
import type { Runners } from '../src/runners.mts'

const TEST_PLAN = ['# Тест-план', '', '## R1 · Требование', '', '**U1 · поведение**  [unit]', '- Дано: вход', '- Когда: вызов', '- Тогда: результат', '- Ловит: поломку', ''].join('\n')

type Out = { result: string; instruction?: string; reason?: string; current?: string }

function flow(root: string, runners: Runners, ...args: string[]): Out {
  let out = ''
  run(args, { cwd: root, out: text => { out += text }, runners, sleep: () => {}, now: () => new Date(2026, 10, 23) })
  return JSON.parse(out)
}

function cycle(root: string, decision: 'annotated' | 'approved'): Out {
  const converged = { iter: 1, max: 3, verdict: 'NO_MAJOR_ISSUES', converged: true, blocking: 0, reportPath: '.doc-review/x/iter-1-report.md', atCap: false }
  const { runners } = stubRunners({ review: [converged, converged], result: decision === 'annotated' ? { decision, feedback: 'Уточните.', annotationCount: 1 } : { decision } })
  const submitted = flow(root, runners, 'submit')
  if (submitted.result !== 'pending') throw new Error(JSON.stringify(submitted))
  return flow(root, runners, 'wait', '--timeout', '1')
}

function atTestPlan(): string {
  const root = tempRoot()
  initTestRepository(root)
  begin(root, 'A2')
  closeThrough(root, 'A2', 'spec')
  seedRules(root)
  const draft = join(root, 'tmp', 'drafts', 'a2-test-plan.md')
  mkdirSync(dirname(draft), { recursive: true })
  writeFileSync(draft, TEST_PLAN)
  return root
}

test('A1: замечания по тест-плану велят править только его черновик', () => {
  const root = atTestPlan()

  const annotated = cycle(root, 'annotated')

  assert.equal(annotated.result, 'annotated')
  assert.match(annotated.instruction ?? '', /только в черновике стадии test-plan/)
})

test('A2: approved документа с замечаниями требует актуализировать спеку до sync', () => {
  const root = atTestPlan()
  cycle(root, 'annotated')

  const approved = cycle(root, 'approved')
  const { runners } = stubRunners({ result: { decision: 'approved' } })
  const blocked = flow(root, runners, 'next', '--agent', 'claude')
  const synced = flow(root, runners, 'sync')

  assert.equal(approved.result, 'approved')
  assert.match(approved.instruction ?? '', /spec/)
  assert.match(blocked.reason ?? '', /flow sync/)
  assert.equal(synced.result, 'ok')
  assert.equal(readStateFile(root, 'A2').annotated, undefined)
})

test('A3: approved без замечаний ничего актуализировать не требует', () => {
  const root = atTestPlan()

  const approved = cycle(root, 'approved')

  assert.equal(approved.instruction, undefined)
  assert.equal(readStateFile(root, 'A2').drift, undefined)
})
