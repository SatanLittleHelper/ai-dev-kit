import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { dateStamp, draftPath, slugOf, targetPath } from '../src/paths.mts'
import type { TaskState } from '../src/types.mts'

const NOW = new Date(2026, 10, 3)
const WITH_STEP: TaskState = { id: 'A2', stepDir: 'docs/task-flow/steps/work-packages', stages: [] }
const STANDALONE: TaskState = { id: 'ABC-7', stages: [] }

test('dateStamp дополняет месяц и день нулями', () => {
  assert.equal(dateStamp(NOW), '2026-11-03')
})

test('слаг берётся из каталога шага, иначе из id в нижнем регистре', () => {
  assert.equal(slugOf(WITH_STEP), 'work-packages')
  assert.equal(slugOf(STANDALONE), 'abc-7')
})

test('целевые пути шага роадмапа лежат в каталоге шага', () => {
  const dir = 'docs/task-flow/steps/work-packages'

  assert.equal(targetPath(WITH_STEP, 'spec', NOW), `${dir}/2026-11-03-work-packages-design.md`)
  assert.equal(targetPath(WITH_STEP, 'test-plan', NOW), `${dir}/2026-11-03-A2-work-packages-tests.md`)
  assert.equal(targetPath(WITH_STEP, 'plan', NOW), `${dir}/2026-11-03-A2-work-packages.md`)
})

test('целевые пути одиночной задачи лежат в docs/superpowers', () => {
  assert.equal(targetPath(STANDALONE, 'spec', NOW), 'docs/superpowers/specs/2026-11-03-abc-7-design.md')
  assert.equal(targetPath(STANDALONE, 'test-plan', NOW), 'docs/superpowers/plans/2026-11-03-abc-7-tests.md')
  assert.equal(targetPath(STANDALONE, 'plan', NOW), 'docs/superpowers/plans/2026-11-03-abc-7.md')
})

test('черновик абсолютный и различается по стадиям', () => {
  const root = '/repo'

  assert.equal(draftPath(root, WITH_STEP, 'spec'), join(root, 'tmp', 'drafts', 'work-packages-design.md'))
  assert.equal(draftPath(root, WITH_STEP, 'test-plan'), join(root, 'tmp', 'drafts', 'work-packages-test-plan.md'))
  assert.equal(draftPath(root, WITH_STEP, 'plan'), join(root, 'tmp', 'drafts', 'work-packages-plan.md'))
})
