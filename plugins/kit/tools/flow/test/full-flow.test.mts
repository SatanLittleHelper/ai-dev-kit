import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { run } from '../cli/run.mts'
import type { Io } from '../cli/run.mts'
import { closeThrough, initTestRepository, readStateFile, tempRoot, writeEvidence } from './support.mts'
import { seedRules } from './rules-support.mts'
import { stubRunners } from './runners-support.mts'

const URL = 'https://forgejo.example/org/repo/pulls/7'
const NOW = new Date(2026, 10, 23)

const SPEC = '# Спека\n\nОписание поведения задачи на русском языке.\n'

const PLAN = [
  '# План',
  '',
  '> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.',
  '',
  '## Global Constraints',
  '',
  '- rules/base/minimal-change.md',
  '',
  '## Тест-кейсы',
  '',
  '## R1 · Требование',
  '',
  '**U1 · поведение**  [unit]',
  '- Дано: вход',
  '- Когда: вызов',
  '- Тогда: результат',
  '- Ловит: поломку',
  '',
  '### Task 1: Реализация',
  '',
  '**Test IDs:** U1',
  '',
  '- [ ] Выполнить шаг',
  '',
].join('\n')

const CONVERGED = { iter: 1, max: 3, verdict: 'NO_MAJOR_ISSUES', converged: true, blocking: 0, reportPath: '.doc-review/x/iter-1-report.md', atCap: false }

function session() {
  const root = tempRoot()
  initTestRepository(root)
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/task-flow-f1\n')
  const transitions: (string | undefined)[] = []
  const stub = stubRunners({ result: { decision: 'approved', message: 'Одобрено' }, review: [CONVERGED] })
  seedRules(root)
  const io: Io = {
    cwd: root,
    now: () => NOW,
    out: () => {},
    runners: stub.runners,
    sleep: () => {},
    jiraTransition: (_root, key, _noDryRun, _instance, target) => {
      transitions.push(target)
      return { code: 0, stdout: JSON.stringify({ key, url: `https://jira.example.com/browse/${key}`, status: 'transitioned', issueStatus: target === 'review' ? 'Ревью' : 'В работе' }), stderr: '' }
    },
    prLookup: () => ({ state: 'open', merged: false, headRef: 'task-flow-f1', fromFork: false, url: URL }),
  }
  const flow = (...argv: string[]): { code: number; json: Record<string, any> } => {
    let output = ''
    const code = run(argv, { ...io, out: text => { output = text } })
    return { code, json: JSON.parse(output) }
  }
  return { root, flow, transitions }
}

test('F1 E1: задача проходит все 11 стадий', () => {
  const { root, flow, transitions } = session()
  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }

  flow('start', 'ABC-1')
  assert.equal(flow('next').json.current, 'spec')
  assert.deepEqual(transitions, [undefined])
  assert.equal(flow('next').json.stage, 'spec')

  write('tmp/drafts/abc-1-design.md', SPEC)
  assert.equal(flow('submit').json.result, 'pending')
  assert.equal(flow('wait').json.result, 'approved')

  assert.equal(flow('skip', 'test-plan', '--reason', 'combined: небольшая задача').json.current, 'plan')
  write('tmp/drafts/abc-1-plan.md', PLAN)
  assert.equal(flow('submit').json.result, 'pending')
  assert.equal(flow('wait').json.result, 'approved')

  assert.equal(flow('next').json.result, 'needs-input')
  assert.equal(flow('next', '--method', 'inline').json.agentPackage.method, 'inline')
  assert.equal(flow('done', 'implement', '--evidence', writeEvidence(root, 'ABC-1', 'implement')).json.current, 'simplify')
  assert.equal(flow('done', 'simplify', '--evidence', writeEvidence(root, 'ABC-1', 'simplify')).json.current, 'check')
  assert.equal(flow('done', 'check', '--evidence', writeEvidence(root, 'ABC-1', 'check')).json.current, 'local-test')
  assert.equal(flow('done', 'local-test', '--evidence', writeEvidence(root, 'ABC-1', 'local-test')).json.current, 'review')
  assert.equal(flow('submit').json.result, 'pending')
  assert.equal(flow('wait').json.result, 'approved')
  assert.equal(flow('done', 'pr', '--evidence', URL).json.completed, true)

  assert.deepEqual(transitions, [undefined, 'review'])
  assert.ok(readStateFile(root, 'ABC-1').stages.every(stage => stage.status !== 'pending'))
})

test('F1 E2: пропуск local-test без причины невозможен, с причиной — возможен', () => {
  const { root, flow } = session()
  flow('start', 'A1', '--no-tracker')
  closeThrough(root, 'A1', 'check')

  assert.equal(flow('skip', 'local-test').json.result, 'blocked')
  const skipped = flow('skip', 'local-test', '--reason', 'нет инфраструктуры')

  assert.equal(skipped.json.current, 'review')
})
