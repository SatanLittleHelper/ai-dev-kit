import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getStatus } from '../src/flow.mts'
import { begin, expectBlocked, expectOk, readStateFile, tempRoot } from './support.mts'

const writeJson = (root: string, name: string, content: string): void => {
  mkdirSync(join(root, 'tmp', 'flow'), { recursive: true })
  writeFileSync(join(root, 'tmp', 'flow', name), content)
}

test('U27: посторонний json не ломает работу с --task и назван в отказе без него', () => {
  const root = tempRoot()
  begin(root, 'A1')
  writeJson(root, 'notes.json', '{"hello": 1}')

  const refusal = expectBlocked(getStatus({ root }))

  assert.match(refusal.reason, /notes\.json/)
  assert.match(refusal.reason, /--task <id>/)
  assert.equal(expectOk(getStatus({ root, id: 'A1' })).task, 'A1')
})

test('U28: повреждённый json назван в отказе, остальные задачи доступны по --task', () => {
  const root = tempRoot()
  begin(root, 'A1')
  writeJson(root, 'B7.json', '{ не json')

  const refusal = expectBlocked(getStatus({ root }))

  assert.match(refusal.reason, /B7\.json/)
  assert.equal(expectOk(getStatus({ root, id: 'A1' })).task, 'A1')
})

test('U29: нарушенная структура stages даёт blocked без исключения', () => {
  const root = tempRoot()
  begin(root, 'A1')
  const good = readStateFile(root, 'A1')
  const variants = [
    { ...good, stages: good.stages.map((stage, index) => (index === 0 ? { ...stage, name: 'deploy' } : stage)) },
    { ...good, stages: good.stages.map((stage, index) => (index === 1 ? { ...stage, status: 'weird' } : stage)) },
    { ...good, stages: [good.stages[0], good.stages[0], ...good.stages.slice(2)] },
    { ...good, stages: good.stages.slice(0, 3) },
  ]

  for (const variant of variants) {
    writeJson(root, 'A1.json', JSON.stringify(variant))
    const refusal = expectBlocked(getStatus({ root, id: 'A1' }))
    assert.match(refusal.reason, /A1\.json/)
  }
})
