import assert from 'node:assert/strict'
import { test } from 'node:test'
import { run } from '../cli/run.mts'
import { begin, initTestRepository, reach, readStateFile, stageOf, tempRoot, writeEvidence } from './support.mts'

function flow(cwd: string, ...argv: string[]): { code: number; json: Record<string, unknown> } {
  let output = ''
  const code = run(argv, { cwd, out: text => { output = text } })
  return { code, json: JSON.parse(output) }
}

function atStage(stage: 'simplify' | 'check') {
  const root = tempRoot()
  initTestRepository(root)
  begin(root)
  reach(root, 'A1', stage)
  return root
}

test('F1 U31: done разбирается и закрывает стадию', () => {
  const root = atStage('simplify')
  const evidence = writeEvidence(root, 'A1', 'simplify')

  const { code, json } = flow(root, 'done', 'simplify', '--evidence', evidence, '--task', 'A1')

  assert.equal(code, 0)
  assert.equal(json.current, 'check')
  assert.equal(stageOf(readStateFile(root, 'A1'), 'simplify')?.evidence, evidence)
})

test('F1 U32: done без стадии и лишние аргументы отклоняются', () => {
  const root = atStage('simplify')

  const missing = flow(root, 'done').json
  const extra = flow(root, 'done', 'simplify', 'extra').json
  assert.equal(missing.result, 'blocked')
  assert.match(String(missing.reason), /Неизвестная стадия/)
  assert.equal(extra.result, 'blocked')
  assert.match(String(extra.reason), /Лишний аргумент «extra»/)
})

test('F1 U33: --method, --agent и --evidence без значения отклоняются', () => {
  const root = atStage('check')

  for (const [command, flag] of [['next', '--method'], ['next', '--agent'], ['done', '--evidence']]) {
    const { json } = flow(root, command, ...(command === 'done' ? ['simplify'] : []), flag)
    assert.equal(json.result, 'blocked')
    assert.match(String(json.reason), /требует значение/)
  }
})
