import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { computeTime } from '../src/time.mts'
import { initTestRepository, tempRoot } from './support.mts'

const CLI = fileURLToPath(new URL('../cli/main.mts', import.meta.url))
const at = (hours: number): string => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + hours * 3_600_000).toISOString()
const ev = (hours: number, event = 'done'): { at: string; stage: 'spec'; event: 'done' } => ({ at: at(hours), stage: 'spec', event } as never)

test('TM1: интервалы суммируются, длинная пауза отбрасывается, дни по 6 часов', () => {
  const result = computeTime([ev(0, 'start'), ev(1), ev(2), ev(12), ev(14)], 3)
  assert.deepEqual(result, { days: 0.7, hours: 4, active: 3, skipped: 1 })
})

test('TM2: меньше двух событий — days null', () => {
  assert.equal(computeTime([], 3).days, null)
  assert.equal(computeTime([ev(0, 'start')], 3).days, null)
})

test('TM3: порядок событий не важен', () => {
  assert.equal(computeTime([ev(2), ev(0, 'start'), ev(1)], 3).hours, 2)
})

function flow(cwd: string, ...args: string[]): { code: number; json: any } {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
  return { code: run.status ?? -1, json: JSON.parse(run.stdout) }
}

test('TM4: start и skip пишут timeline; flow time читает его', () => {
  const root = tempRoot()
  initTestRepository(root)
  flow(root, 'start', 'A1', '--no-tracker')
  flow(root, 'skip', 'spec', '--task', 'A1', '--reason', 'не нужна')
  const state = JSON.parse(readFileSync(join(root, 'tmp', 'flow', 'A1.json'), 'utf8'))
  assert.deepEqual(state.timeline.map((entry: { stage: string; event: string }) => [entry.stage, entry.event]), [['ticket', 'start'], ['spec', 'skipped']])
  const response = flow(root, 'time', '--task', 'A1')
  assert.equal(response.code, 0)
  assert.equal(response.json.result, 'time')
  assert.equal(typeof response.json.hours, 'number')
})

test('TM5: старый файл без timeline — days null', () => {
  const root = tempRoot()
  initTestRepository(root)
  flow(root, 'start', 'A1', '--no-tracker')
  const path = join(root, 'tmp', 'flow', 'A1.json')
  const state = JSON.parse(readFileSync(path, 'utf8'))
  delete state.timeline
  writeFileSync(path, JSON.stringify(state))
  assert.equal(flow(root, 'time', '--task', 'A1').json.days, null)
})

test('TM6: нет задачи — blocked', () => {
  const root = tempRoot()
  initTestRepository(root)
  assert.equal(flow(root, 'time', '--task', 'NOPE').json.result, 'blocked')
})
