import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { closeStage, skipStage } from '../src/flow.mts'
import { validateDraft } from '../src/validate.mts'
import { begin, closeThrough, expectBlocked, expectOk, initTestRepository, readStateFile, tempRoot, writeDoc } from './support.mts'

const CLI = fileURLToPath(new URL('../cli/main.mts', import.meta.url))

const SPEC = '# Спека\n\nОписание поведения рабочих пакетов на русском языке.'

const PLAN_HEADER = ['# План', '', '> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans', '', '## Global Constraints', '', '- Применяется `rules/base/minimal-change.md`.', ''].join('\n')

const PLAN_TASK = (body: string): string => ['### Task 1: Название задачи', '', body, '', '- [ ] **Step 1: Сделать работу**', ''].join('\n')

function writeDraft(root: string, name: string, content: string): string {
  const path = join(root, 'tmp', 'drafts', name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

test('черновик по умолчанию берётся из пути текущей стадии', () => {
  const root = tempRoot()
  begin(root, 'A2')
  writeDraft(root, 'a2-design.md', SPEC)

  const response = expectOk(validateDraft({ root }))

  assert.equal('valid' in response && response.valid, true)
})

test('--draft переопределяет путь черновика', () => {
  const root = tempRoot()
  begin(root, 'A2')
  writeDoc(root, 'custom', SPEC)

  expectOk(validateDraft({ root, draft: 'docs/custom.md' }))
})

test('отсутствующий черновик: отказ с путём', () => {
  const root = tempRoot()
  begin(root, 'A2')

  const response = expectBlocked(validateDraft({ root }))

  assert.match(response.reason, /a2-design\.md/)
})

test('некорректный документ: отказ перечисляет проблемы', () => {
  const root = tempRoot()
  begin(root, 'A2')
  writeDraft(root, 'a2-design.md', '# Spec\n\nEnglish only text here, nothing else.')

  const response = expectBlocked(validateDraft({ root }))

  assert.match(response.reason, /русск/)
})

test('недокументная стадия: отказ', () => {
  const root = tempRoot()
  begin(root, 'A2')
  closeThrough(root, 'A2', 'plan')

  expectBlocked(validateDraft({ root }))
})

test('план при пропуске тест-плана по иной причине проходит и считает задачи', () => {
  const root = tempRoot()
  begin(root, 'A2')
  closeThrough(root, 'A2', 'spec')
  expectOk(skipStage({ root, id: 'A2', stage: 'test-plan', reason: 'решение пользователя' }))

  writeDraft(root, 'a2-plan.md', [PLAN_HEADER, PLAN_TASK('Описание задачи на русском языке.')].join('\n'))

  const response = expectOk(validateDraft({ root }))

  assert.equal('taskCount' in response && response.taskCount, 1)
})

test('план в объединённом режиме без секции кейсов отклоняется', () => {
  const root = tempRoot()
  begin(root, 'A2')
  closeThrough(root, 'A2', 'spec')
  expectOk(skipStage({ root, id: 'A2', stage: 'test-plan', reason: 'combined: одна задача' }))
  writeDraft(root, 'a2-plan.md', [PLAN_HEADER, PLAN_TASK('Описание задачи на русском языке.')].join('\n'))

  const response = expectBlocked(validateDraft({ root }))

  assert.match(response.reason, /Тест-кейсы/)
})

test('validate через процесс CLI: отказ даёт код 1, успех код 0', () => {
  const root = tempRoot()
  initTestRepository(root)
  const flow = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' })
  flow('start', 'A2', '--no-tracker')

  const missing = flow('validate', '--task', 'A2')
  writeDraft(root, 'a2-design.md', SPEC)
  const valid = flow('validate', '--task', 'A2')

  assert.equal(missing.status, 1)
  assert.equal(valid.status, 0)
  assert.equal(JSON.parse(valid.stdout).valid, true)
})

test('план после согласованного тест-плана: ID сверяются с файлом тест-плана', () => {
  const root = tempRoot()
  begin(root, 'A2')
  closeThrough(root, 'A2', 'spec')
  const testPlan = writeDoc(root, 'tests', '**U1 · поведение**  [unit]\n- Дано: а\n')
  const stages = readStateFile(root, 'A2').stages
  assert.equal(stages.find(stage => stage.name === 'spec')?.status, 'done')
  expectOk(closeStage({ root, id: 'A2', stage: 'test-plan', evidence: testPlan }))
  writeDraft(root, 'a2-plan.md', [PLAN_HEADER, PLAN_TASK('Описание задачи на русском языке без ссылки на кейсы.')].join('\n'))

  const response = expectBlocked(validateDraft({ root }))

  assert.match(response.reason, /U1/)
})
