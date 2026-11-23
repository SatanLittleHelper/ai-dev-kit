import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { seedRules } from './rules-support.mts'
import { initTestRepository, tempRoot } from './support.mts'

const CLI = fileURLToPath(new URL('../cli/main.mts', import.meta.url))

function flow(cwd: string, ...args: string[]): { code: number; stdout: string } {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
  return { code: run.status ?? -1, stdout: run.stdout }
}

function repository(): string {
  const root = tempRoot()
  initTestRepository(root)
  seedRules(root)
  return root
}

test('next через процесс CLI отдаёт пакет в JSON с кодом 0', () => {
  const root = repository()
  flow(root, 'start', 'A2', '--no-tracker', '--step-dir', 'docs/task-flow/steps/work-packages')

  const { code, stdout } = flow(root, 'next', '--task', 'A2')
  const json = JSON.parse(stdout)

  assert.equal(code, 0)
  assert.equal(json.stage, 'spec')
  assert.match(json.package.targetPath, /^docs\/task-flow\/steps\/work-packages\/\d{4}-\d{2}-\d{2}-work-packages-design\.md$/)
})

test('next --text печатает путь черновика и текст правил', () => {
  const root = repository()
  flow(root, 'start', 'A2', '--no-tracker')

  const { code, stdout } = flow(root, 'next', '--task', 'A2', '--text')

  assert.equal(code, 0)
  assert.match(stdout, /Стадия: spec/)
  assert.match(stdout, /Текст правила skills\/brainstorming\.md/)
})
