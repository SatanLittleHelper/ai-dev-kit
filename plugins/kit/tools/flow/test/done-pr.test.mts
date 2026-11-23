import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { doneStage } from '../src/done.mts'
import type { PrInfo, PrLookup } from '../src/pr.mts'
import { begin, closeThrough, expectBlocked, expectOk, initTestRepository, readStateFile, seed, stageOf, tempRoot } from './support.mts'

const URL = 'https://forgejo.example/org/repo/pulls/42'
const JIRA_URL = 'https://jira.example.com/browse/ABC-1'

const pr = (over: Partial<PrInfo> = {}): PrInfo => ({ state: 'open', merged: false, headRef: 'task-flow-f1', fromFork: false, url: URL, ...over })

function atPr(tracked: boolean) {
  const root = tempRoot()
  initTestRepository(root)
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/task-flow-f1\n')
  if (tracked) {
    const state = seed(root, 'ABC-1')
    writeFileSync(join(root, 'tmp', 'flow', 'ABC-1.json'), JSON.stringify({ ...state, tracker: 'jira' }))
    closeThrough(root, 'ABC-1', 'review')
  } else {
    begin(root)
    closeThrough(root, 'A1', 'review')
  }
  return { root, id: tracked ? 'ABC-1' : 'A1' }
}

function jiraStub(code = 0) {
  const calls: { key: string; target?: string }[] = []
  const run = (_root: string, key: string, _noDryRun: boolean, _instance?: string, target?: string) => {
    calls.push({ key, target })
    return { code, stdout: JSON.stringify({ key, url: JIRA_URL, status: 'transitioned', issueStatus: 'Ревью' }), stderr: code ? 'Jira недоступна' : '' }
  }
  return { run, calls }
}

function lookup(result: PrInfo | { error: string }): { run: PrLookup; calls: number[] } {
  const calls: number[] = []
  return { run: (_root, number) => { calls.push(number); return result }, calls }
}

const done = (root: string, id: string, evidence: string, prLookup: PrLookup, jira = jiraStub()) =>
  doneStage({ root, cwd: root, id, stage: 'pr', evidence, prLookup, jiraTransition: jira.run })

test('F1 U21: PR с совпадающей веткой закрывает стадию', () => {
  const { root, id } = atPr(false)
  const found = lookup(pr())

  const response = expectOk(done(root, id, URL, found.run))

  assert.equal(response.completed, true)
  assert.deepEqual(found.calls, [42])
  assert.equal(stageOf(readStateFile(root, id), 'pr')?.evidence, URL)
})

test('F1 U22: несуществующий PR отклоняется', () => {
  const { root, id } = atPr(false)

  const response = expectBlocked(done(root, id, URL, lookup({ error: 'PR не найден' }).run))

  assert.match(response.reason, /PR не найден/)
  assert.equal(stageOf(readStateFile(root, id), 'pr')?.status, 'pending')
})

test('F1 U23: закрытый или чужой по ветке PR отклоняется', () => {
  const { root, id } = atPr(false)

  assert.match(expectBlocked(done(root, id, URL, lookup(pr({ state: 'closed' })).run)).reason, /не открыт/)
  assert.match(expectBlocked(done(root, id, URL, lookup(pr({ headRef: 'other' })).run)).reason, /другой ветки/)
  assert.match(expectBlocked(done(root, id, URL, lookup(pr({ fromFork: true })).run)).reason, /форка/)
  assert.match(expectBlocked(done(root, id, URL, lookup(pr({ url: 'https://forgejo.example/other/repo/pulls/42' })).run)).reason, /не совпадает/)
  assert.equal(stageOf(readStateFile(root, id), 'pr')?.status, 'pending')
})

test('F1 U21 (порядок стадий): вызов на более ранней стадии не обращается ни к Forgejo, ни к Jira', () => {
  const { root, id } = atPr(true)
  const jira = jiraStub()
  const found = lookup(pr())
  const state = readStateFile(root, id)
  writeFileSync(join(root, 'tmp', 'flow', `${id}.json`), JSON.stringify({ ...state, stages: state.stages.map(stage => stage.name === 'review' ? { name: 'review', status: 'pending' } : stage) }))

  expectBlocked(done(root, id, URL, found.run, jira))

  assert.deepEqual([found.calls, jira.calls], [[], []])
})

test('F1 U24: строка, не похожая на URL PR, отклоняется до обращения к сети', () => {
  const { root, id } = atPr(false)
  const found = lookup(pr())

  for (const evidence of ['готово', 'https://example.com/x']) {
    assert.match(expectBlocked(done(root, id, evidence, found.run)).reason, /URL pull request/)
  }
  assert.deepEqual(found.calls, [])
})

test('F1 U25: для задачи Jira после закрытия pr выставляется «Ревью»', () => {
  const { root, id } = atPr(true)
  const jira = jiraStub()

  expectOk(done(root, id, URL, lookup(pr()).run, jira))

  assert.deepEqual(jira.calls, [{ key: 'ABC-1', target: 'review' }])
  assert.equal(stageOf(readStateFile(root, id), 'pr')?.status, 'done')
})

test('F1 U26: сбой Jira не закрывает стадию pr, повторный вызов безопасен', () => {
  const { root, id } = atPr(true)
  const found = lookup(pr())

  const response = expectBlocked(done(root, id, URL, found.run, jiraStub(1)))

  assert.match(response.reason, /Jira недоступна/)
  assert.equal(stageOf(readStateFile(root, id), 'pr')?.status, 'pending')
  expectOk(done(root, id, URL, found.run, jiraStub()))
})

test('F1 U27: для задачи без трекера Jira не вызывается', () => {
  const { root, id } = atPr(false)
  const jira = jiraStub()

  expectOk(done(root, id, URL, lookup(pr()).run, jira))

  assert.deepEqual(jira.calls, [])
})
