import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { skipStage } from '../src/flow.mts'
import { testPlanMode } from '../src/next.mts'
import { reviewFocus } from '../src/review.mts'
import { ReviewUnavailable } from '../src/runners.mts'
import { begin, expectBlocked, expectOk, getState, getStatusOf, tempRoot } from './support.mts'
import { seedRules } from './rules-support.mts'

const SPEC = 'docs/feat/steps/s/design.md'

function project() {
  const root = tempRoot()
  seedRules(root)
  begin(root)
  mkdirSync(dirname(join(root, SPEC)), { recursive: true })
  writeFileSync(join(root, SPEC), '# Спека\n\nОписание.')
  return root
}

test('F2 U12: ранее согласованные документы регистрируются как доказательство с хешем', () => {
  const root = project()

  expectBlocked(skipStage({ root, id: 'A1', stage: 'spec', reason: 'approved: docs/feat/steps/s/missing.md' }))
  expectOk(skipStage({ root, id: 'A1', stage: 'spec', reason: `approved: ${SPEC}` }))
  expectOk(skipStage({ root, id: 'A1', stage: 'test-plan', reason: `approved: ${SPEC}` }))

  const state = getState(root, 'A1')
  const spec = state.stages.find(stage => stage.name === 'spec')
  assert.deepEqual([spec?.status, spec?.evidence, typeof spec?.hash], ['skipped', SPEC, 'string'])
  assert.deepEqual(testPlanMode(state), { mode: 'separate', path: SPEC })
  assert.match(reviewFocus(root, state, 'plan'), /Согласованная спека \(согласована ранее\): docs\/feat\/steps\/s\/design\.md/)

  writeFileSync(join(root, SPEC), 'изменено после регистрации')
  assert.equal(expectOk(getStatusOf(root)).reset?.stages[0], 'spec')

  const plain = tempRoot()
  seedRules(plain)
  begin(plain)
  expectOk(skipStage({ root: plain, id: 'A1', stage: 'spec', reason: 'не нужна' }))
  assert.match(reviewFocus(plain, getState(plain, 'A1'), 'plan'), /Спеки нет/)
})

test('F2 U13: фокус ревью плана включает проверки совмещённого тест-плана', () => {
  const combined = project()
  expectOk(skipStage({ root: combined, id: 'A1', stage: 'spec', reason: `approved: ${SPEC}` }))
  expectOk(skipStage({ root: combined, id: 'A1', stage: 'test-plan', reason: 'combined: небольшая задача' }))
  const separate = project()
  expectOk(skipStage({ root: separate, id: 'A1', stage: 'spec', reason: `approved: ${SPEC}` }))
  expectOk(skipStage({ root: separate, id: 'A1', stage: 'test-plan', reason: 'нет слоёв' }))

  const focus = reviewFocus(combined, getState(combined, 'A1'), 'plan')

  for (const part of ['совмещённый тест-план', 'покрытие требований спеки', 'слои', 'ветви', 'тавтологичность', 'поведение вместо реализации', 'антипаттерны', 'writing-test-plans.md']) {
    assert.ok(focus.includes(part), part)
  }
  assert.doesNotMatch(reviewFocus(separate, getState(separate, 'A1'), 'plan'), /совмещённый тест-план/)

  rmSync(join(combined, 'rules', 'skills', 'writing-test-plans.md'))
  assert.throws(() => reviewFocus(combined, getState(combined, 'A1'), 'plan'), ReviewUnavailable)
})
