import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadRules } from '../src/rules.mts'
import { ruleText, seedRules, STAGE_RULE_FILES } from './rules-support.mts'
import { tempRoot } from './support.mts'

test('правила стадии читаются из rules/ репозитория кита', () => {
  const root = tempRoot()
  seedRules(root)

  const result = loadRules(root, 'spec', [])

  assert.deepEqual(result, { dir: join(root, 'rules'), rules: [{ name: 'skills/brainstorming.md', text: ruleText('skills/brainstorming.md') }] })
})

test('у потребителя правила берутся из .claude/ai-dev-kit/rules', () => {
  const root = tempRoot()
  seedRules(root, '.claude/ai-dev-kit/rules')

  const result = loadRules(root, 'plan', [])

  assert.deepEqual('rules' in result && result.rules.map(rule => rule.name), [...STAGE_RULE_FILES.plan])
})

test('при обеих папках приоритет у .claude/ai-dev-kit/rules', () => {
  const root = tempRoot()
  seedRules(root)
  seedRules(root, '.claude/ai-dev-kit/rules')
  writeFileSync(join(root, '.claude', 'ai-dev-kit', 'rules', 'skills', 'brainstorming.md'), 'Версия подмодуля')

  const result = loadRules(root, 'spec', [])

  assert.deepEqual(result, { dir: join(root, '.claude', 'ai-dev-kit', 'rules'), rules: [{ name: 'skills/brainstorming.md', text: 'Версия подмодуля' }] })
})

test('правила стеков добавляются только для стадии plan', () => {
  const root = tempRoot()
  seedRules(root)

  const plan = loadRules(root, 'plan', ['angular', 'nestjs'])
  const spec = loadRules(root, 'spec', ['angular', 'nestjs'])

  assert.deepEqual('rules' in plan && plan.rules.map(rule => rule.name), [...STAGE_RULE_FILES.plan, 'angular/index.md', 'nestjs/index.md'])
  assert.deepEqual('rules' in spec && spec.rules.map(rule => rule.name), [...STAGE_RULE_FILES.spec])
})

test('без папки правил отказ называет проверенные места', () => {
  const result = loadRules(tempRoot(), 'plan', [])

  assert.equal('reason' in result && /rules/.test(result.reason), true)
})

test('отсутствующий файл правила называется в отказе', () => {
  const root = tempRoot()
  seedRules(root)
  rmSync(join(root, 'rules', 'base', 'minimal-change.md'))

  const result = loadRules(root, 'plan', [])

  assert.equal('reason' in result && result.reason.includes('base/minimal-change.md'), true)
})
