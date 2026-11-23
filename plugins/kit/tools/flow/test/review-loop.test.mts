import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { reviewProfile } from '../src/review.mts'
import { ReviewUnavailable } from '../src/runners.mts'
import type { ReviewOutcome } from '../src/runners.mts'
import { submitDraft } from '../src/submit.mts'
import { begin, closeThrough, expectBlocked, tempRoot } from './support.mts'
import { seedRules } from './rules-support.mts'
import { stubRunners } from './runners-support.mts'

const NOW = new Date(2026, 10, 23)

const TEST_PLAN = ['# Тест-план', '', '## R1 · Требование', '', '**U1 · поведение**  [unit]', '- Дано: вход', '- Когда: вызов', '- Тогда: результат', '- Ловит: поломку', ''].join('\n')

function atTestPlan(extra?: (root: string) => void) {
  const root = tempRoot()
  begin(root, 'A2')
  closeThrough(root, 'A2', 'spec')
  seedRules(root)
  extra?.(root)
  const path = join(root, 'tmp', 'drafts', 'a2-test-plan.md')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, TEST_PLAN)
  return { root, path }
}

const outcome = (over: Partial<ReviewOutcome>): ReviewOutcome => ({ iter: 1, max: 3, verdict: 'ISSUES_REMAIN', converged: false, blocking: 2, reportPath: '.doc-review/x/iter-1-report.md', atCap: false, ...over })

const submit = (root: string, runners: ReturnType<typeof stubRunners>['runners']) => submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW }) as { result: string; iter?: number; reportPath?: string; verdict?: string; instruction?: string; review?: { iter: number } }

test('U20: submit тест-плана сначала запускает ревью', () => {
  const { root, path } = atTestPlan(dir => {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'dev-conventions.json'), JSON.stringify({ codex: { profile: 'codex' } }))
  })
  const { runners, calls } = stubRunners({ review: [outcome({})] })

  submit(root, runners)

  assert.equal(calls.review.length, 1)
  assert.deepEqual([calls.review[0].draft, calls.review[0].type, calls.review[0].max, calls.review[0].profile], [path, 'test-plan', 3, 'codex'])
  assert.equal(calls.plannotator.length, 0)
})

test('U21: замечания возвращаются отчётом итерации', () => {
  const { root } = atTestPlan()
  const { runners, calls } = stubRunners({ review: [outcome({ iter: 1 })] })

  const response = submit(root, runners)

  assert.deepEqual([response.result, response.iter, response.verdict, response.reportPath], ['review-feedback', 1, 'ISSUES_REMAIN', '.doc-review/x/iter-1-report.md'])
  assert.ok(response.instruction?.includes(`(cd '${root}' && node `))
  assert.match(response.instruction ?? '', /record-iteration/)
  assert.equal(calls.plannotator.length, 0)
})

test('U22: NO_MAJOR_ISSUES переводит к показу', () => {
  const { root } = atTestPlan()
  const { runners, calls } = stubRunners({ review: [outcome({ iter: 2, verdict: 'NO_MAJOR_ISSUES', converged: true, blocking: 0 })] })

  const response = submit(root, runners)

  assert.equal(response.result, 'pending')
  assert.equal(response.review?.iter, 2)
  assert.equal(calls.plannotator.length, 1)
})

test('U23: после третьей итерации нужен блок «Не сошлись», затем показ без нового ревью', () => {
  const { root, path } = atTestPlan()
  const { runners, calls } = stubRunners({ review: [outcome({ iter: 1 }), outcome({ iter: 2 }), outcome({ iter: 3, atCap: true })] })

  const results = [submit(root, runners), submit(root, runners), submit(root, runners)]
  const withoutBlock = submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW })
  writeFileSync(path, `## Не сошлись\n\nЗамечание: позиции сторон.\n\n${TEST_PLAN}`)
  const shown = submit(root, runners)

  assert.deepEqual(results.map(response => response.result), ['review-feedback', 'review-feedback', 'review-feedback'])
  assert.match(results[2].instruction ?? '', /Не сошлись/)
  assert.equal(withoutBlock.result, 'blocked')
  assert.equal(shown.result, 'pending')
  assert.equal(calls.review.length, 3)
  assert.equal(calls.plannotator.length, 1)
})

test('U24: spec не проходит doc-review', () => {
  const root = tempRoot()
  begin(root, 'A2')
  const path = join(root, 'tmp', 'drafts', 'a2-design.md')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '# Спека\n\nОписание поведения на русском языке для проверки.')
  const { runners, calls } = stubRunners()

  const response = submit(root, runners)

  assert.equal(response.result, 'pending')
  assert.equal(calls.review.length, 0)
})

test('U25: недоступный Codex даёт blocked с причиной', () => {
  const { root } = atTestPlan()
  const { runners, calls } = stubRunners({ review: new ReviewUnavailable('codex не найден') })

  const response = expectBlocked(submitDraft({ root, cwd: root, id: 'A2', runners, now: NOW }))

  assert.match(response.reason, /codex не найден/)
  assert.equal(calls.plannotator.length, 0)
})

test('U26: профиль берётся по приоритету из конфигурации проекта', () => {
  const root = tempRoot()
  const write = (config: object): void => {
    mkdirSync(join(root, '.claude'), { recursive: true })
    writeFileSync(join(root, '.claude', 'dev-conventions.json'), JSON.stringify(config))
  }

  assert.equal(reviewProfile(root), 'codex')
  write({ codex: { profile: 'main' } })
  assert.equal(reviewProfile(root), 'main')
  write({ codex: { profile: 'main', review: { profile: 'local' } } })
  assert.equal(reviewProfile(root), 'local')
})
