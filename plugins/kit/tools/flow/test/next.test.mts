import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { skipStage, startTask } from '../src/flow.mts'
import { nextPackage } from '../src/next.mts'
import { ruleText, seedRules, writeManifest } from './rules-support.mts'
import { begin, closeThrough, expectBlocked, expectNeedsInput, expectOk, expectPackage, tempRoot } from './support.mts'

const NOW = new Date(2026, 10, 23)
const STEP_DIR = 'docs/task-flow/steps/work-packages'

test('spec: пакет содержит пути, русский язык и правила brainstorming', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')

  const response = expectPackage(nextPackage({ root, now: NOW }))

  assert.equal(response.task, 'A2')
  assert.equal(response.stage, 'spec')
  assert.equal(response.package.draftPath, join(root, 'tmp', 'drafts', 'a2-design.md'))
  assert.equal(response.package.targetPath, 'docs/superpowers/specs/2026-11-23-a2-design.md')
  assert.equal(response.package.language, 'ru')
  assert.equal(response.package.rulesDir, join(root, 'rules'))
  assert.deepEqual(response.package.rules, [{ name: 'skills/brainstorming.md', text: ruleText('skills/brainstorming.md') }])
  assert.equal('testPlan' in response.package, false)
})

test('с каталогом шага цель лежит в папке шага', () => {
  const root = tempRoot()
  seedRules(root)
  expectOk(startTask({ root, id: 'A2', noTracker: true, stepDir: STEP_DIR }))

  const response = expectPackage(nextPackage({ root, now: NOW }))

  assert.equal(response.package.targetPath, `${STEP_DIR}/2026-11-23-work-packages-design.md`)
})

test('test-plan: инструкция говорит, как выбрать объединённый режим', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')
  closeThrough(root, 'A2', 'spec')

  const response = expectPackage(nextPackage({ root, now: NOW }))

  assert.equal(response.stage, 'test-plan')
  assert.equal(response.package.instructions.some(line => line.includes('flow skip test-plan --reason "combined')), true)
  assert.equal(response.package.rules.length, 3)
})

test('plan после согласованного тест-плана: режим separate с путём', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')
  closeThrough(root, 'A2', 'test-plan')

  const response = expectPackage(nextPackage({ root, now: NOW }))

  assert.equal(response.stage, 'plan')
  assert.deepEqual(response.package.testPlan, { mode: 'separate', path: join(root, 'docs', 'test-plan.md') })
})

test('plan после пропуска combined: режим combined', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')
  closeThrough(root, 'A2', 'spec')
  expectOk(skipStage({ root, id: 'A2', stage: 'test-plan', reason: 'combined: одна задача' }))

  const response = expectPackage(nextPackage({ root, now: NOW }))

  assert.deepEqual(response.package.testPlan, { mode: 'combined' })
})

test('plan после пропуска по другой причине: режим none', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')
  closeThrough(root, 'A2', 'spec')
  expectOk(skipStage({ root, id: 'A2', stage: 'test-plan', reason: 'решение пользователя' }))

  const response = expectPackage(nextPackage({ root, now: NOW }))

  assert.deepEqual(response.package.testPlan, { mode: 'none' })
})

test('plan: стеки из package.json и их правила попадают в пакет', () => {
  const root = tempRoot()
  seedRules(root)
  writeManifest(root, { '@angular/core': '^20.0.0' })
  begin(root, 'A2')
  closeThrough(root, 'A2', 'test-plan')

  const response = expectPackage(nextPackage({ root, now: NOW }))

  assert.deepEqual(response.package.stacks, ['angular'])
  assert.equal(response.package.rules.some(rule => rule.name === 'angular/index.md'), true)
})

test('plan: инструкции называют skill стека и skill writing-plans', () => {
  const root = tempRoot()
  seedRules(root)
  writeManifest(root, { '@nestjs/core': '^11.0.0' })
  begin(root, 'A2')
  closeThrough(root, 'A2', 'test-plan')

  const { package: pack } = expectPackage(nextPackage({ root, now: NOW }))

  assert.equal(pack.instructions.some(line => line.includes('superpowers:writing-plans')), true)
  assert.equal(pack.instructions.some(line => line.includes('nestjs-best-practices:nestjs-best-practices') && line.includes('<rulesDir>/nestjs/<тема>.md')), true)
})

test('spec: инструкции называют skill brainstorming', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')

  const { package: pack } = expectPackage(nextPackage({ root, now: NOW }))

  assert.equal(pack.instructions.some(line => line.includes('superpowers:brainstorming')), true)
})

test('недокументная стадия: отказ с указанием на прежние правила', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')
  closeThrough(root, 'A2', 'plan')

  const response = expectBlocked(nextPackage({ root, now: NOW }))

  assert.match(response.reason, /implement/)
  assert.match(response.reason, /прежн/)
})

test('без правил кита: отказ с причиной, а не исключение', () => {
  const root = tempRoot()
  begin(root, 'A2')

  const response = expectBlocked(nextPackage({ root, now: NOW }))

  assert.match(response.reason, /правил/)
})

test('несколько открытых задач: вопрос о том, какая имеется в виду', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')
  begin(root, 'A3')

  expectNeedsInput(nextPackage({ root, now: NOW }))
})

test('задача завершена: отказ', () => {
  const root = tempRoot()
  seedRules(root)
  begin(root, 'A2')
  closeThrough(root, 'A2', 'pr')

  expectBlocked(nextPackage({ root, id: 'A2', now: NOW }))
})
