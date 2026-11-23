import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getStatus } from '../src/flow.mts'
import { submitDraft } from '../src/submit.mts'
import { waitForDecision } from '../src/wait.mts'
import { begin, expectBlocked, expectOk, readStateFile, stageOf, tempRoot } from './support.mts'
import { stubRunners } from './runners-support.mts'
import type { StubOptions } from './runners-support.mts'

const SPEC = '# Спека\n\nОписание поведения утверждения на русском языке.'
const NOW = new Date(2026, 10, 23)
const TARGET = 'docs/superpowers/specs/2026-11-23-a2-design.md'

function submitted(options: StubOptions) {
  const root = tempRoot()
  begin(root, 'A2')
  const draft = join(root, 'tmp', 'drafts', 'a2-design.md')
  mkdirSync(dirname(draft), { recursive: true })
  writeFileSync(draft, SPEC)
  submitDraft({ root, cwd: root, id: 'A2', runners: stubRunners(options).runners, now: NOW })
  return { root, draft }
}

const wait = (root: string) => waitForDecision({ root, id: 'A2', timeoutMs: 0, sleep: () => {} })

test('U14: approved записывает документ, закрывает стадию и удаляет черновик', () => {
  const { root, draft } = submitted({ result: { decision: 'approved' } })

  wait(root)

  assert.equal(readFileSync(join(root, TARGET), 'utf8'), SPEC)
  assert.equal(existsSync(draft), false)
  const spec = stageOf(readStateFile(root, 'A2'), 'spec')
  assert.deepEqual([spec?.status, spec?.evidence, typeof spec?.hash], ['done', TARGET, 'string'])
})

test('U15: до approved целевой файл не пишется', () => {
  for (const decision of ['annotated', 'dismissed']) {
    const { root, draft } = submitted({ result: { decision, feedback: 'Правки.' } })

    wait(root)

    assert.equal(existsSync(join(root, TARGET)), false)
    assert.equal(existsSync(draft), true)
  }
})

test('U16: повторный wait после approved не теряет результат', () => {
  const { root } = submitted({ result: { decision: 'approved' } })
  wait(root)
  const hash = stageOf(readStateFile(root, 'A2'), 'spec')?.hash

  const again = wait(root)

  assert.equal(again.result, 'approved')
  assert.equal(stageOf(readStateFile(root, 'A2'), 'spec')?.hash, hash)
})

test('U17: повторный wait после annotated возвращает те же замечания', () => {
  const { root } = submitted({ result: { decision: 'annotated', feedback: 'Уточните раздел 2.', annotationCount: 1 } })

  const first = wait(root)
  const second = wait(root)

  assert.deepEqual(second, first)
})

test('U18: правка согласованного документа сбрасывает стадию', () => {
  const { root } = submitted({ result: { decision: 'approved' } })
  wait(root)
  writeFileSync(join(root, TARGET), `${SPEC}\nПравка.`)

  const status = expectOk(getStatus({ root, id: 'A2' }))

  assert.equal(status.current, 'spec')
  assert.equal(status.reset?.file, TARGET)
})

test('U19: существующий другой файл не перезаписывается', () => {
  const { root } = submitted({ result: { decision: 'approved' } })
  mkdirSync(dirname(join(root, TARGET)), { recursive: true })
  writeFileSync(join(root, TARGET), 'чужой документ')

  const response = expectBlocked(wait(root))

  assert.match(response.reason, /a2-design\.md/)
  assert.equal(readFileSync(join(root, TARGET), 'utf8'), 'чужой документ')

  const aliased = submitted({ result: { decision: 'approved' } })
  const aliasTarget = join(aliased.root, TARGET)
  mkdirSync(dirname(aliasTarget), { recursive: true })
  symlinkSync(aliased.draft, aliasTarget)
  assert.match(expectBlocked(wait(aliased.root)).reason, /черновик/i)
  assert.equal(readFileSync(aliased.draft, 'utf8'), SPEC)
  assert.equal(stageOf(readStateFile(root, 'A2'), 'spec')?.status, 'pending')
})
test('U36: черновик, изменённый после показа, не засчитывается', () => {
  const { root, draft } = submitted({ result: { decision: 'approved' } })
  writeFileSync(draft, `${SPEC}\nПравка после показа.`)

  const response = expectBlocked(wait(root))

  assert.match(response.reason, /изменён после показа/)
  assert.equal(existsSync(join(root, TARGET)), false)
  assert.equal(stageOf(readStateFile(root, 'A2'), 'spec')?.status, 'pending')
  writeFileSync(draft, SPEC)
  assert.match(expectBlocked(wait(root)).reason, /повторите flow submit/i)
  assert.equal(existsSync(join(root, TARGET)), false)
})

test('U37: сброс стадии очищает сессию показа', () => {
  const { root } = submitted({ result: { decision: 'approved' } })
  wait(root)
  writeFileSync(join(root, TARGET), `${SPEC}\nПравка.`)

  expectOk(getStatus({ root, id: 'A2' }))

  assert.equal(readStateFile(root, 'A2').session, undefined)
  assert.equal(expectBlocked(wait(root)).reason.includes('flow submit'), true)

  writeFileSync(join(root, 'tmp', 'drafts', 'a2-design.md'), `${SPEC}\nНовая версия.`)
  submitDraft({ root, cwd: root, id: 'A2', runners: stubRunners({ result: { decision: 'approved' } }).runners, now: NOW })
  wait(root)
  assert.match(readFileSync(join(root, TARGET), 'utf8'), /Новая версия/)
})
