import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDocumentStage } from '../src/stages.mts'

test('isDocumentStage отличает документные стадии', () => {
  assert.deepEqual(['spec', 'test-plan', 'plan', 'implement', 'pr'].map(name => isDocumentStage(name as never)), [true, true, true, false, false])
})
