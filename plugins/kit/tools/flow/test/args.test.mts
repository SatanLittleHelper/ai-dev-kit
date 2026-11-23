import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run } from '../cli/run.mts'
import { initTestRepository, tempRoot } from './support.mts'

function flow(root: string, ...args: string[]): { code: number; json: { result: string; reason?: string } } {
  let out = ''
  const code = run(args, { cwd: root, out: text => { out += text } })
  return { code, json: JSON.parse(out) }
}

test('U30: неизвестный флаг отклоняется', () => {
  const root = tempRoot()
  initTestRepository(root)

  const response = flow(root, 'status', '--taks', 'A1')

  assert.equal(response.json.result, 'blocked')
  assert.match(response.json.reason ?? '', /--taks/)
})

test('U31: лишний позиционный аргумент отклоняется', () => {
  const root = tempRoot()
  initTestRepository(root)

  for (const args of [['status', 'extra'], ['submit', 'extra'], ['start', 'A1', 'B2']]) {
    const response = flow(root, ...args)
    assert.equal(response.json.result, 'blocked', args.join(' '))
    assert.match(response.json.reason ?? '', /extra|B2/)
  }
})

test('U32: флаг без значения отклоняется и не берёт следующий флаг', () => {
  const root = tempRoot()
  initTestRepository(root)

  for (const args of [['status', '--task'], ['skip', 'spec', '--reason'], ['validate', '--draft'], ['status', '--task', '--text']]) {
    const response = flow(root, ...args)
    assert.equal(response.json.result, 'blocked', args.join(' '))
    assert.match(response.json.reason ?? '', /требует значение/)
  }
})
