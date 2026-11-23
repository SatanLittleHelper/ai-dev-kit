import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseArgs } from '../cli/args.mts'
import { startTask } from '../src/flow.mts'
import { expectBlocked, expectOk, readStateFile, tempRoot } from './support.mts'

const STEP_DIR = 'docs/task-flow/steps/work-packages'

test('start запоминает каталог шага без хвостового слеша', () => {
  const root = tempRoot()

  expectOk(startTask({ root, id: 'A2', noTracker: true, stepDir: `${STEP_DIR}/` }))

  assert.equal(readStateFile(root, 'A2').stepDir, STEP_DIR)
})

test('start без --step-dir не пишет поле stepDir', () => {
  const root = tempRoot()

  expectOk(startTask({ root, id: 'A2', noTracker: true }))

  assert.equal('stepDir' in readStateFile(root, 'A2'), false)
})

test('start отклоняет абсолютный каталог шага', () => {
  const root = tempRoot()

  const response = expectBlocked(startTask({ root, id: 'A2', stepDir: '/etc/steps' }))

  assert.match(response.reason, /--step-dir/)
})

test('start отклоняет каталог шага с выходом наверх', () => {
  const root = tempRoot()

  expectBlocked(startTask({ root, id: 'A2', stepDir: 'docs/../../outside' }))
})

test('parseArgs читает --step-dir и --draft', () => {
  const parsed = parseArgs(['start', 'A2', '--step-dir', STEP_DIR, '--draft', 'tmp/drafts/x.md'])

  assert.equal(parsed.stepDir, STEP_DIR)
  assert.equal(parsed.draft, 'tmp/drafts/x.md')
})
