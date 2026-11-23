import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { submitDraft } from '../src/submit.mts'
import { waitForDecision } from '../src/wait.mts'
import { begin, expectBlocked, expectNeedsInput, readStateFile, stageOf, tempRoot } from './support.mts'
import { stubRunners } from './runners-support.mts'
import type { StubOptions } from './runners-support.mts'

const SPEC = '# Спека\n\nОписание поведения команды wait на русском языке.'
const NOW = new Date(2026, 10, 23)

function submitted(options: StubOptions) {
  const root = tempRoot()
  begin(root, 'A2')
  const path = join(root, 'tmp', 'drafts', 'a2-design.md')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, SPEC)
  const { runners } = stubRunners(options)
  submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW })
  return root
}

const wait = (root: string, timeoutMs = 0) => waitForDecision({ root, id: 'A2', timeoutMs, sleep: () => {} }) as { result: string; feedback?: string; annotationCount?: number }

test('U7: approved', () => {
  const root = submitted({ result: { decision: 'approved' } })

  assert.equal(wait(root).result, 'approved')
})

test('U8: annotated возвращает замечания и не закрывает стадию', () => {
  const root = submitted({ result: { decision: 'annotated', feedback: 'Уточните раздел 2.', annotationCount: 2 } })

  const response = wait(root)

  assert.deepEqual([response.result, response.feedback, response.annotationCount], ['annotated', 'Уточните раздел 2.', 2])
  assert.equal(stageOf(readStateFile(root, 'A2'), 'spec')?.status, 'pending')
})

test('U9: dismissed не закрывает стадию', () => {
  const root = submitted({ result: { decision: 'dismissed' } })

  assert.equal(wait(root).result, 'dismissed')
  assert.equal(stageOf(readStateFile(root, 'A2'), 'spec')?.status, 'pending')
})

test('U10: «no feedback» не считается согласованием', () => {
  for (const result of [{ decision: 'annotated', feedback: 'User reviewed the document and has no feedback.', nothingToSend: true }, { decision: 'annotated', feedback: 'User reviewed the document and has no feedback.' }]) {
    const root = submitted({ result })

    const response = expectNeedsInput(waitForDecision({ root, id: 'A2', timeoutMs: 0, sleep: () => {} }))

    assert.match(response.question, /согласован/)
    assert.equal(stageOf(readStateFile(root, 'A2'), 'spec')?.status, 'pending')
  }
})

test('U11: пустой или повреждённый ответ даёт blocked', () => {
  for (const result of ['', '{ не json', '{"decision":"maybe"}']) {
    const root = submitted({ result })

    const response = expectBlocked(waitForDecision({ root, id: 'A2', timeoutMs: 0, sleep: () => {} }))

    assert.match(response.reason, /ответ Plannotator/i)
  }
})

test('U12: нет ответа до таймаута даёт pending, сессия остаётся', () => {
  const root = submitted({})

  const first = wait(root, 0)
  const second = wait(root, 0)

  assert.deepEqual([first.result, second.result], ['pending', 'pending'])
  assert.equal(readStateFile(root, 'A2').session?.status, 'open')
})

test('U13: wait без submit отклоняется', () => {
  const root = tempRoot()
  begin(root, 'A2')

  const response = expectBlocked(waitForDecision({ root, id: 'A2', timeoutMs: 0, sleep: () => {} }))

  assert.match(response.reason, /flow submit/)
})
