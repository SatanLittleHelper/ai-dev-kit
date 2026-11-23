import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { testPlanMode } from './next.mts'
import { loadRules } from './rules.mts'
import { detectStacks } from './stack.mts'
import { recordIterationCommand, ReviewUnavailable } from './runners.mts'
import type { Runners } from './runners.mts'
import { writeState } from './store.mts'
import { blocked } from './responses.mts'
import type { BlockedResponse, ReviewFeedbackResponse, ReviewProgress, ReviewSummary, TaskState } from './types.mts'

export function reviewProfile(root: string): string {
  const file = join(root, '.claude', 'dev-conventions.json')
  if (!existsSync(file)) return 'codex'

  try {
    const codex = (JSON.parse(readFileSync(file, 'utf8')) as { codex?: { profile?: string; review?: { profile?: string } } }).codex
    return codex?.review?.profile ?? codex?.profile ?? 'codex'
  } catch {
    return 'codex'
  }
}

export function reviewFocus(root: string, state: TaskState, stage: 'test-plan' | 'plan'): string {
  const testPlan = testPlanMode(state)
  const spec = state.stages.find(candidate => candidate.name === 'spec')
  const specLine = spec?.status === 'done' && spec.evidence ? `Согласованная спека: ${spec.evidence}.` : 'Спеки нет (стадия пропущена).'
  const approved = stage === 'plan' && testPlan.mode === 'separate' ? ` Согласованный тест-план: ${testPlan.path}; каждый его ID должен встретиться ровно в одной задаче, новых тестов в плане быть не должно.` : ''
  const found = loadRules(root, stage, detectStacks(root))
  if ('reason' in found) throw new ReviewUnavailable(found.reason)
  const paths = found.rules.map(rule => join(found.dir, rule.name))
  if (stage === 'plan') {
    for (const rule of ['base/testing.md', 'base/test-execution-policy.md']) {
      const path = join(found.dir, rule)
      if (!existsSync(path)) throw new ReviewUnavailable(`Не найден файл правил ${path}.`)
      paths.push(path)
    }
  }
  const rules = ` Прочитайте правила: ${paths.join(', ')}.`

  return `${specLine}${approved}${rules} Отметьте лишние задачи и спекулятивные опции, зависимости, слои.`
}

const REVIEW_MAX = 3
const DISAGREEMENT = /^(?:# [^\r\n]+\r?\n\s*)?##[ \t]+Не сошлись[ \t]*(?:\r?\n|$)/

export function reviewDraft(root: string, state: TaskState, stage: 'test-plan' | 'plan', draft: string, runners: Runners['review']):
  { summary?: ReviewSummary } | { response: BlockedResponse | ReviewFeedbackResponse } {
  const saved = state.reviews?.[stage]
  const progress = saved?.draft === draft ? saved : undefined
  if (progress?.status === 'done') return {}
  if (progress?.status === 'exhausted') {
    const beginning = readFileSync(draft, 'utf8').trimStart()
    if (!DISAGREEMENT.test(beginning)) {
      return { response: blocked('Ревью исчерпало три итерации. Добавьте в начало черновика раздел «Не сошлись» и повторите flow submit.') }
    }
    return {}
  }

  try {
    const save = (next: ReviewProgress): void => {
      state.reviews = { ...state.reviews, [stage]: next }
      writeState(root, state)
    }
    let summary: ReviewSummary
    let reason: 'converged' | 'cap-hit' | undefined

    if (progress?.status === 'finishing') {
      ({ summary, reason } = progress)
    } else {
      const focus = reviewFocus(root, state, stage)
      if (progress === undefined) runners.reset({ draft, cwd: root })
      const { atCap, ...outcome } = runners.run({ draft, type: stage, max: REVIEW_MAX, profile: reviewProfile(root), focus, cwd: root })
      summary = outcome
      reason = summary.converged ? 'converged' : atCap || summary.iter >= REVIEW_MAX ? 'cap-hit' : undefined
      if (reason) save({ draft, status: 'finishing', summary, reason })
    }

    if (reason) runners.finish({ draft, cwd: root, reason })
    save({ draft, status: reason === 'converged' ? 'done' : reason === 'cap-hit' ? 'exhausted' : 'running' })
    if (summary.converged) return { summary }

    const { iter, max, verdict, blocking, reportPath } = summary
    const instruction = reason === 'cap-hit'
      ? 'Предел итераций исчерпан. Добавьте в начало черновика раздел «Не сошлись» с замечаниями и позициями сторон, затем повторите flow submit.'
      : `Исправьте замечания или объясните, почему их отклонили. Запишите решение командой ${recordIterationCommand(root, draft)} и повторите flow submit.`

    return { response: { result: 'review-feedback', task: state.id, stage, iter, max, verdict, blocking, reportPath, instruction } }
  } catch (error) {
    if (error instanceof ReviewUnavailable) return { response: blocked(`Ревью doc-review недоступно: ${error.message}`) }
    throw error
  }
}
