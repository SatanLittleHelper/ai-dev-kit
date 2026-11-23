import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { initTestRepository, tempRoot } from './support.mts'

const CLI = fileURLToPath(new URL('../cli/main.mts', import.meta.url))

function flow(cwd: string, ...args: string[]): { code: number; stdout: string } {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
  return { code: run.status ?? -1, stdout: run.stdout }
}

function project(): string {
  const root = tempRoot()
  initTestRepository(root)
  flow(root, 'start', 'F1', '--no-tracker')
  return root
}

test('E1 хуки U16: события и флаги разбираются, ошибки использования отклоняются', () => {
  const root = project()

  for (const args of [['guard'], ['guard', 'nothing'], ['guard', 'stop', 'extra'], ['guard', 'stop', '--branch']]) {
    const { code, stdout } = flow(root, ...args)
    assert.equal(code, 1, args.join(' '))
    assert.equal(JSON.parse(stdout).result, 'blocked', args.join(' '))
  }

  const allowed = flow(root, 'guard', 'stop', '--stop-active', '--branch', 'task-flow-f1')
  assert.equal(allowed.code, 0)
  assert.deepEqual(JSON.parse(allowed.stdout), { result: 'guard', decision: 'allow' })
})

test('E1 хуки U17: код выхода отражает решение', () => {
  const root = project()

  const denied = flow(root, 'guard', 'stop', '--branch', 'task-flow-f1')
  assert.equal(denied.code, 3)
  assert.equal(JSON.parse(denied.stdout).decision, 'deny')

  assert.equal(flow(root, 'guard', 'stop', '--branch', 'task-flow-f1', '--stop-active').code, 0)

  const text = flow(root, 'guard', 'stop', '--branch', 'task-flow-f1', '--text')
  assert.equal(text.code, 3)
  assert.match(text.stdout, /Задача F1/)
})
