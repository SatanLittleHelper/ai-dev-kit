import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { skipStage } from '../src/flow.mts'
import { plannotatorCommand } from '../src/plannotator.mts'
import { submitDraft } from '../src/submit.mts'
import { waitForDecision } from '../src/wait.mts'
import { begin, closeThrough, expectBlocked, expectOk, tempRoot, readStateFile } from './support.mts'
import { stubRunners } from './runners-support.mts'

const SPEC = '# Спека\n\nОписание поведения команды submit на русском языке.'
const NOW = new Date(2026, 10, 23)

function draft(root: string, name: string, content = SPEC): string {
  const path = join(root, 'tmp', 'drafts', name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

function pendingOf(response: unknown): { result: string; stage: string; draft: string } {
  return response as { result: string; stage: string; draft: string }
}

test('U1: submit запускает Plannotator с историей версий и gate', () => {
  const root = tempRoot()
  begin(root, 'A2')
  const path = draft(root, 'a2-design.md')
  const { runners, calls } = stubRunners()

  const response = pendingOf(submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW }))

  assert.equal(response.result, 'pending')
  assert.equal(calls.plannotator[0].draft, path)
  const command = plannotatorCommand(path, '/r.json')
  assert.deepEqual(command.args, ['annotate', path, '--gate', '--json', '--result-file', '/r.json'])
  assert.equal(command.env.PLANNOTATOR_ANNOTATE_HISTORY, '1')
})

test('U2: submit не запускает показ при невалидном черновике', () => {
  const root = tempRoot()
  begin(root, 'A2')
  closeThrough(root, 'A2', 'test-plan')
  draft(root, 'a2-plan.md', '# План без задач\n\nТекст на русском языке без заголовков задач.')
  const { runners, calls } = stubRunners()

  const response = expectBlocked(submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW }))

  assert.match(response.reason, /не прошёл проверку/)
  assert.equal(calls.plannotator.length, 0)
})

test('U3: submit без черновика отклоняется', () => {
  const root = tempRoot()
  begin(root, 'A2')
  const { runners, calls } = stubRunners()

  const response = expectBlocked(submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW }))

  assert.match(response.reason, /a2-design\.md/)
  assert.equal(calls.plannotator.length, 0)
})

test('U4: submit на стадии без документа отклоняется', () => {
  const root = tempRoot()
  begin(root, 'A2')
  closeThrough(root, 'A2', 'plan')
  const { runners } = stubRunners()

  const response = expectBlocked(submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW }))

  assert.match(response.reason, /implement/)
})

test('U5: повторный submit при открытой сессии не запускает вторую', () => {
  const root = tempRoot()
  begin(root, 'A2')
  draft(root, 'a2-design.md')
  const { runners, calls } = stubRunners()

  submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW })
  const again = pendingOf(submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW }))

  assert.equal(again.result, 'pending')
  assert.equal(calls.plannotator.length, 1)
  assert.equal(readStateFile(root, 'A2').session?.stage, 'spec')

  expectOk(skipStage({ root, id: 'A2', stage: 'spec', reason: 'спека не требуется' }))
  assert.match(expectBlocked(waitForDecision({ root, id: 'A2', timeoutMs: 0 })).reason, /flow submit/)
})

test('U6: --draft задаёт путь черновика', () => {
  const root = tempRoot()
  begin(root, 'A2')
  const path = draft(root, 'custom.md')
  const { runners, calls } = stubRunners()

  const response = pendingOf(submitDraft({ root, cwd: root, id: 'A2', draft: 'tmp/drafts/custom.md', runners, now: NOW }))

  assert.equal(response.result, 'pending')
  assert.equal(calls.plannotator[0].draft, path)
})
