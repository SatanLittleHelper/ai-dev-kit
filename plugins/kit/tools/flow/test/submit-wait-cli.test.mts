import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { run } from '../cli/run.mts'
import { initTestRepository, tempRoot } from './support.mts'
import { stubRunners } from './runners-support.mts'
import type { Runners } from '../src/runners.mts'

const SPEC = '# Спека\n\nОписание поведения сквозного сценария на русском языке.'

function flow(root: string, runners: Runners, ...args: string[]): { code: number; json: { result: string; current?: string; feedback?: string } } {
  let out = ''
  const code = run(args, { cwd: root, out: text => { out += text }, runners, sleep: () => {}, now: () => new Date(2026, 10, 23) })
  return { code, json: JSON.parse(out) }
}

test('E1: полный цикл стадии через CLI', () => {
  const root = tempRoot()
  initTestRepository(root)
  const { runners } = stubRunners({ result: { decision: 'annotated', feedback: 'Уточните.', annotationCount: 1 } })
  const approving = stubRunners({ result: { decision: 'approved' } }).runners
  const draft = join(root, 'tmp', 'drafts', 'a2-design.md')
  mkdirSync(dirname(draft), { recursive: true })

  flow(root, runners, 'start', 'A2', '--no-tracker')
  writeFileSync(draft, SPEC)
  const first = flow(root, runners, 'submit')
  const annotated = flow(root, runners, 'wait', '--timeout', '1')
  writeFileSync(draft, `${SPEC}\nПравка по замечанию.`)
  const second = flow(root, approving, 'submit')
  const approved = flow(root, approving, 'wait', '--timeout', '1')
  const status = flow(root, approving, 'status')

  assert.deepEqual([first.json.result, annotated.json.result, second.json.result, approved.json.result], ['pending', 'annotated', 'pending', 'approved'])
  assert.deepEqual([first.code, annotated.code, second.code, approved.code], [0, 2, 0, 0])
  assert.equal(status.json.current, 'test-plan')
})
