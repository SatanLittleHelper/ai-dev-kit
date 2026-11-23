import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { repoRelative } from './evidence.mts'
import { testPlanMode } from './next.mts'
import { draftPath } from './paths.mts'
import { blocked, currentStage } from './responses.mts'
import { isDocumentStage } from './stages.mts'
import { loadTask } from './task-access.mts'
import { validateDocument } from './validators/index.mts'
import type { FlowResponse } from './types.mts'

export function validateDraft({ root, id, draft, cwd }: { root: string; id?: string; draft?: string; cwd?: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  const stage = currentStage(state)
  if (stage === null) return blocked(`Задача ${state.id} завершена: проверять нечего.`)
  if (!isDocumentStage(stage)) return blocked(`Стадия ${stage} не имеет проверяемого документа: проверка поддерживается для spec, test-plan и plan.`)

  let path = draftPath(root, state, stage)
  if (draft) {
    const rel = repoRelative(root, cwd ?? root, draft)
    if (rel === null) return blocked(`Путь черновика вне репозитория: ${draft}.`)
    path = resolve(root, rel)
  }
  if (repoRelative(root, root, path) === null) return blocked(`Путь черновика вне репозитория: ${path}.`)
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) return blocked(`Черновик не найден: ${path}.`)

  const testPlan = testPlanMode(state)
  let testPlanText: string | undefined
  if (stage === 'plan' && testPlan.mode === 'separate') {
    const testPlanFile = resolve(root, testPlan.path)
    testPlanText = existsSync(testPlanFile) ? readFileSync(testPlanFile, 'utf8') : undefined
  }

  const { problems, taskCount } = validateDocument(stage, readFileSync(path, 'utf8'), { testPlan, testPlanText })
  if (problems.length > 0) return blocked(`Документ ${path} не прошёл проверку: ${problems.join(' ')}`)

  return { result: 'ok', task: state.id, stage, valid: true, ...(taskCount === undefined ? {} : { taskCount }), ...(reset ? { reset } : {}) }
}
