import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getStatus, skipStage } from '../src/flow.mts'
import { renderJson, renderText } from '../src/format.mts'
import { begin, closeThrough, tempRoot } from './support.mts'

test('U31: каждый ответ несёт одно из трёх значений result', () => {
  const root = tempRoot()
  begin(root, 'A1')
  closeThrough(root, 'A1', 'implement')
  const okResponse = getStatus({ root, id: 'A1' })
  const blockedResponse = skipStage({ root, id: 'A1', stage: 'simplify' })
  begin(root, 'A2')
  const needsInput = getStatus({ root })

  const parsedOk = JSON.parse(renderJson(okResponse))
  const parsedBlocked = JSON.parse(renderJson(blockedResponse))
  const parsedNeedsInput = JSON.parse(renderJson(needsInput))

  assert.equal(parsedOk.result, 'ok')
  assert.ok(Array.isArray(parsedOk.stages))
  assert.equal(parsedBlocked.result, 'blocked')
  assert.equal(typeof parsedBlocked.reason, 'string')
  assert.equal(parsedNeedsInput.result, 'needs-input')
  assert.equal(typeof parsedNeedsInput.question, 'string')
  assert.ok(Array.isArray(parsedNeedsInput.options))
})

test('U32: режим text выводит русский читаемый текст', () => {
  const root = tempRoot()
  begin(root, 'A1')
  closeThrough(root, 'A1', 'implement')

  const text = renderText(skipStage({ root, id: 'A1', stage: 'simplify' }))

  assert.throws(() => JSON.parse(text))
  assert.match(text, /нужна причина/)
  assert.ok(text.includes('simplify'))
})
