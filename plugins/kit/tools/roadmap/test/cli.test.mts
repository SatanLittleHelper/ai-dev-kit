import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roadmap, tempDir } from './support.mts'

test('CLI1: неизвестная команда — blocked, код 1', () => {
  const response = roadmap(tempDir(), {}, 'nope')
  assert.equal(response.code, 1)
  assert.equal(response.json.result, 'blocked')
})

test('CLI2: --text печатает человекочитаемый ответ', () => {
  const response = roadmap(tempDir(), {}, 'nope', '--text')
  assert.match(response.stdout, /^Отказ:/)
})
