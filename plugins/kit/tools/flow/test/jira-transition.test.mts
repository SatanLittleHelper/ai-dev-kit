import assert from 'node:assert/strict'
import { mkdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { run } from '../cli/run.mts'
import { statePath } from '../src/store.mts'
import { seedRules } from './rules-support.mts'
import { initTestRepository, readStateFile, seed, stageOf, tempRoot } from './support.mts'

const KEY = 'ABC-42'
const URL = 'https://jira.example.com/browse/ABC-42'

function reply(fields?: Record<string, unknown>) {
  return {
    code: 0,
    stdout: JSON.stringify({ key: KEY, url: URL, status: 'transitioned', issueStatus: 'В работе', ...fields }),
    stderr: 'Открываю Jira',
  }
}

function repository() {
  const root = tempRoot()
  initTestRepository(root)
  seedRules(root)
  const nested = join(root, 'docs', 'nested')
  mkdirSync(nested, { recursive: true })
  const calls: { cwd: string; key: string; noDryRun: boolean; instance?: string }[] = []
  let jira = (_noDryRun: boolean) => reply()

  const cli = (...args: string[]) => {
    let output = ''
    const code = run(args, {
      cwd: nested,
      out: text => { output = text },
      jiraTransition: (cwd: string, key: string, noDryRun: boolean, instance?: string) => {
        calls.push({ cwd, key, noDryRun, ...(instance ? { instance } : {}) })
        return jira(noDryRun)
      },
    })
    return { code, ...JSON.parse(output) }
  }

  return { root, cli, calls, setJira: (execute: typeof jira) => { jira = execute } }
}

test('C1 I1: только next вызывает Jira из корня проекта', () => {
  const { root, cli, calls } = repository()
  assert.equal(cli('start', KEY).current, 'in-progress')
  assert.equal(cli('status').current, 'in-progress')
  assert.deepEqual(calls, [])
  assert.equal(cli('next').current, 'spec')
  assert.deepEqual(calls, [{ cwd: root, key: KEY, noDryRun: false }])
})

test('C1 I1: ссылка закрепляет экземпляр Jira до выполнения перехода', () => {
  const { root, cli, calls } = repository()
  assert.equal(cli('start', URL).current, 'in-progress')
  const config = join(root, '.claude', 'dev-conventions.json')
  mkdirSync(join(root, '.claude'), { recursive: true })
  for (const baseUrl of [undefined, 'https://other.example.com', 'https://jira.example.com/other']) {
    writeFileSync(config, JSON.stringify({ jira: { baseUrl } }))
    assert.equal(cli('next').result, 'blocked')
  }
  assert.deepEqual(calls, [])
  assert.equal(stageOf(readStateFile(root, KEY), 'in-progress')?.status, 'pending')
  writeFileSync(config, JSON.stringify({ jira: { baseUrl: 'https://jira.example.com/' } }))
  assert.equal(cli('next').current, 'spec')
  assert.deepEqual(calls, [{ cwd: root, key: KEY, noDryRun: false, instance: 'https://jira.example.com' }])
})

for (const status of ['transitioned', 'already-in-progress']) {
  test(`C1 I2: ${status} сохраняет доказательство, следующий next отдаёт пакет`, () => {
    const { root, cli, calls, setJira } = repository()
    setJira(() => reply({ status }))
    cli('start', KEY)
    assert.equal(cli('next').current, 'spec')
    assert.deepEqual(stageOf(readStateFile(root, KEY), 'in-progress'), { name: 'in-progress', status: 'done', evidence: URL })
    assert.equal(cli('next').stage, 'spec')
    assert.equal(calls.length, 1)
  })
}

test('C1 I2: повтор после сбоя записи не выполняет второй переход', () => {
  const { root, cli, calls, setJira } = repository()
  cli('start', KEY)
  const file = statePath(root, KEY)
  const backup = `${file}.saved`
  let mutations = 0
  setJira(() => {
    if (mutations > 0) return reply({ status: 'already-in-progress' })
    mutations++
    renameSync(file, backup)
    mkdirSync(file)
    return reply()
  })

  try {
    const first = cli('next')
    assert.equal(first.result, 'blocked')
    assert.match(first.reason, /записать|сохранить/)
  } finally {
    if (mutations) {
      rmdirSync(file)
      renameSync(backup, file)
    }
  }

  assert.equal(cli('next').current, 'spec')
  assert.equal(stageOf(readStateFile(root, KEY), 'in-progress')?.evidence, URL)
  assert.equal(calls.length, 2)
  assert.equal(mutations, 1)
})

test('C1 I3: пробные и ненадёжные ответы оставляют стадию открытой', () => {
  const { root, cli, calls, setJira } = repository()
  cli('start', KEY)
  const invalid = [
    [reply({ status: 'dry-run', issueStatus: 'Открыто' }), /--no-dry-run/],
    [{ code: 2, stdout: '', stderr: 'Выполните jira login' }, /jira login/],
    [{ ...reply(), stdout: '{' }, /JSON/],
    [reply({ status: 'unknown' }), /статус|ответ/],
    [reply({ status: undefined }), /статус|ответ/],
    [reply({ key: 'ABC-43' }), /ABC-42/],
    [reply({ url: 'https://jira.example.com/browse/ABC-43' }), /URL|адрес/],
  ] as const
  for (const [response, reason] of invalid) {
    setJira(() => response)
    const result = cli('next')
    assert.equal(result.code, 1)
    assert.match(result.reason, reason)
    assert.equal(stageOf(readStateFile(root, KEY), 'in-progress')?.status, 'pending')
  }

  setJira(noDryRun => noDryRun ? reply() : reply({ status: 'dry-run' }))
  assert.equal(cli('next', '--no-dry-run').current, 'spec')
  assert.equal(calls.at(-1)?.noDryRun, true)
  assert.equal(cli('next', '--no-dry-run').result, 'blocked')
})

test('C1 I4: skip требует причину и не вызывает Jira', () => {
  const { root, cli, calls } = repository()
  cli('start', KEY)
  assert.equal(cli('skip', 'in-progress').result, 'blocked')
  assert.equal(cli('skip', 'in-progress', '--reason', 'Пользователь отказался').current, 'spec')
  assert.equal(stageOf(readStateFile(root, KEY), 'in-progress')?.reason, 'Пользователь отказался')
  assert.deepEqual(calls, [])
})

test('C1 I5: старые состояния не вызывают Jira до явной привязки', () => {
  const { root, cli, calls } = repository()
  for (const key of ['A1', KEY]) {
    seed(root, key, [{ name: 'ticket', status: 'done', evidence: key }])
    assert.equal(cli('next', '--task', key).result, 'blocked')
  }
  assert.equal(cli('next', '--confirm-jira').result, 'blocked')
  assert.deepEqual(calls, [])

  assert.equal(cli('skip', 'in-progress', '--task', 'A1', '--reason', 'Локальная задача').current, 'spec')
  assert.equal(cli('next', '--task', KEY, '--confirm-jira').current, 'spec')
  const migrated = readStateFile(root, KEY)
  assert.equal(migrated.tracker, 'jira')
  assert.equal(stageOf(migrated, 'ticket')?.evidence, KEY)
  assert.equal(stageOf(migrated, 'in-progress')?.evidence, URL)
  assert.equal(calls.length, 1)
})
