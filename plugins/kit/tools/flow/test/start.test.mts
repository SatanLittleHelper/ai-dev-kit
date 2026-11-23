import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startTask } from '../src/flow.mts'
import { expectBlocked, expectNeedsInput, expectOk, initTestRepository, readStateFile, seed, stageOf, tempRoot } from './support.mts'

function repository(branch: string, config?: object): string {
  const root = tempRoot()
  initTestRepository(root)
  execFileSync('git', ['symbolic-ref', 'HEAD', `refs/heads/${branch}`], { cwd: root })
  if (config) {
    mkdirSync(join(root, '.claude'))
    writeFileSync(join(root, '.claude', 'dev-conventions.json'), JSON.stringify(config))
  }
  return root
}

test('U1: start создаёт состояние с 10 стадиями', () => {
  const root = repository('feature/ABC-7')

  const response = expectOk(startTask({ root, id: 'ABC-42' }))

  const state = readStateFile(root, 'ABC-42')
  assert.deepEqual(state.stages.map(stage => stage.name), ['ticket', 'in-progress', 'spec', 'test-plan', 'plan', 'implement', 'polish', 'local-test', 'review', 'pr'])
  assert.equal(stageOf(state, 'ticket')?.status, 'done')
  assert.equal(stageOf(state, 'ticket')?.evidence, 'ABC-42')
  assert.equal(state.tracker, 'jira')
  assert.ok(state.stages.slice(1).every(stage => stage.status === 'pending'))
  assert.equal(response.current, 'in-progress')
})

test('U2: start с флагом no-tracker пропускает in-progress', () => {
  const root = tempRoot()

  const response = expectOk(startTask({ root, id: 'local-refactor', noTracker: true }))

  const state = readStateFile(root, 'local-refactor')
  assert.equal(state.tracker, undefined)
  assert.equal(stageOf(state, 'in-progress')?.status, 'skipped')
  assert.equal(stageOf(state, 'in-progress')?.reason, 'no-tracker')
  assert.equal(response.current, 'spec')
})

test('U3: повторный start не затирает задачу', () => {
  const root = tempRoot()
  seed(root, 'ABC-1', [
    { name: 'ticket', status: 'done', evidence: 'ABC-1' },
    { name: 'in-progress', status: 'skipped', reason: 'no-tracker' },
    { name: 'spec', status: 'done', evidence: 'готово' },
  ])

  const response = expectBlocked(startTask({ root, id: 'ABC-1' }))

  assert.match(response.reason, /уже начата/)
  assert.equal(stageOf(readStateFile(root, 'ABC-1'), 'spec')?.status, 'done')
})

test('U5: id с разделителем пути отклоняется', () => {
  const root = tempRoot()

  for (const id of ['../evil', 'a/b']) {
    assert.match(expectBlocked(startTask({ root, id, noTracker: true })).reason, /Недопустимый id/)
  }

  assert.equal(existsSync(join(root, 'tmp', 'flow')), false)
  assert.equal(existsSync(join(root, 'evil.json')), false)
})

const settings = { jira: { baseUrl: 'https://jira.example.com/team' } }

test('C1 U2: URL карточки превращается в ключ', () => {
  const root = repository('dev', settings)
  const response = expectOk(startTask({ root, id: 'https://jira.example.com/team/browse/ABC-42?src=chat' }))
  assert.equal(response.task, 'ABC-42')
  assert.equal(stageOf(readStateFile(root, 'ABC-42'), 'ticket')?.evidence, 'ABC-42')
})

test('C1 U3: чужой хост и чужой контекст Jira отклоняются', () => {
  const root = repository('dev', settings)
  for (const id of ['https://other.example.com/team/browse/ABC-42', 'https://jira.example.com/other/browse/ABC-42']) {
    assert.match(expectBlocked(startTask({ root, id })).reason, /экземпляр Jira/)
  }
  assert.equal(existsSync(join(root, 'tmp')), false)
})

test('C1 U4: неверный аргумент не заменяется ключом из ветки', () => {
  const root = repository('feature/ABC-42')
  for (const id of ['', 'http://jira.example.com/browse/ABC-42', 'https://jira.example.com/issues/ABC-42', 'oops']) {
    expectBlocked(startTask({ root, id }))
  }
  assert.equal(existsSync(join(root, 'tmp')), false)
})

test('C1 U5: ключ из имени ветки используется без аргумента', () => {
  const root = repository('feature/ABC-42-cleanup')
  assert.equal(expectOk(startTask({ root })).task, 'ABC-42')
})

test('C1 U6: префикс ограничивает определение ключа по имени ветки', () => {
  const root = repository('ABC-42-vs-XYZ-7', { ticketPrefix: 'XYZ' })
  assert.equal(expectOk(startTask({ root })).task, 'XYZ-7')
})

test('C1 U7: без однозначного ключа flow предлагает ввод или jira-writer', () => {
  for (const branch of ['dev', 'ABC-42-vs-XYZ-7']) {
    const root = repository(branch)
    const response = expectNeedsInput(startTask({ root }))
    assert.match(response.options.join(' '), /jira-writer/)
    assert.equal(existsSync(join(root, 'tmp')), false)
  }
})
