import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tempRoot } from './support.mts'

const CLI = fileURLToPath(new URL('../cli/main.mts', import.meta.url))

interface Output {
  result: string
  task?: string
  current?: string | null
  reason?: string
}

function flow(cwd: string, ...args: string[]): { code: number; json: Output } {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
  return { code: run.status ?? -1, json: JSON.parse(run.stdout) }
}

function gitRepo(): string {
  const root = tempRoot()
  execFileSync('git', ['init', '-q'], { cwd: root })
  return root
}

test('E1: полный сценарий через процесс CLI', () => {
  const root = gitRepo()

  const started = flow(root, 'start', 'A1', '--no-tracker')
  const before = flow(root, 'status', '--task', 'A1')
  const skipped = flow(root, 'skip', 'spec', '--task', 'A1', '--reason', 'спека не нужна')
  const after = flow(root, 'status', '--task', 'A1')

  assert.deepEqual([started.code, before.code, skipped.code, after.code], [0, 0, 0, 0])
  assert.equal(before.json.current, 'spec')
  assert.equal(after.json.current, 'test-plan')
  assert.equal(existsSync(join(root, 'tmp', 'flow', 'A1.json')), true)
})

test('E2: запуск из вложенной папки находит то же состояние', () => {
  const root = gitRepo()
  flow(root, 'start', 'A1', '--no-tracker')
  const nested = join(root, 'docs', 'task-flow')
  mkdirSync(nested, { recursive: true })

  const response = flow(nested, 'status', '--task', 'A1')

  assert.equal(response.code, 0)
  assert.equal(response.json.task, 'A1')
  assert.equal(existsSync(join(nested, 'tmp')), false)
})

test('E3: blocked и needs-input дают ненулевые коды', () => {
  const root = gitRepo()
  flow(root, 'start', 'A1', '--no-tracker')
  flow(root, 'start', 'A2', '--no-tracker')

  const choice = flow(root, 'status')
  const refusal = flow(root, 'skip', 'spec', '--task', 'A1')

  assert.equal(choice.code, 2)
  assert.equal(choice.json.result, 'needs-input')
  assert.equal(refusal.code, 1)
  assert.equal(refusal.json.result, 'blocked')
  assert.match(refusal.json.reason ?? '', /нужна причина/)
})

test('E4: неизвестная команда', () => {
  const root = gitRepo()

  const response = flow(root, 'deploy')

  assert.equal(response.code, 1)
  assert.equal(response.json.result, 'blocked')
  for (const command of ['start', 'status', 'skip']) assert.ok(response.json.reason?.includes(command))
})

test('E5: запуск вне git-репозитория', () => {
  const response = flow(tempRoot(), 'status')

  assert.equal(response.code, 1)
  assert.match(response.json.reason ?? '', /git-репозиторий/)
})
