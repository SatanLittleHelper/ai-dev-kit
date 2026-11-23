import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileHash, pathsAlias, repoRelative } from './evidence.mts'
import { draftPath, targetPath } from './paths.mts'
import { reviewDraft } from './review.mts'
import { blocked, currentStage } from './responses.mts'
import type { Runners } from './runners.mts'
import { writeState } from './store.mts'
import { loadTask, withTaskLock } from './task-access.mts'
import { validateDraft } from './validate.mts'
import type { FlowResponse, ReviewSummary } from './types.mts'

interface SubmitOptions {
  root: string
  cwd: string
  id?: string
  draft?: string
  runners: Runners
  now: Date
}

export function submitDraft(options: SubmitOptions): FlowResponse {
  const { root, id } = options
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const task = loaded.state.id
  return withTaskLock(root, task, () => submit({ ...options, id: task }))
}

function submit({ root, cwd, id, draft, runners, now }: SubmitOptions & { id: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state } = loaded
  const session = state.session
  if (session?.status === 'open' && session.stage === currentStage(state)) {
    return { result: 'pending', task: state.id, stage: session.stage, draft: session.draft }
  }

  const checked = validateDraft({ root, id: state.id, draft, cwd })
  if (!('valid' in checked)) return checked

  const stage = checked.stage
  const rel = draft ? repoRelative(root, cwd, draft) : null
  const draftFile = rel === null ? draftPath(root, state, stage) : resolve(root, rel)

  const target = targetPath(state, stage, now)
  const targetFile = resolve(root, target)
  if (pathsAlias(targetFile, draftFile)) {
    return blocked('Черновик и целевой документ должны быть разными файлами.')
  }
  if (repoRelative(root, root, target) === null) return blocked(`Целевой путь вне репозитория: ${target}.`)

  let review: ReviewSummary | undefined
  if (stage === 'test-plan' || stage === 'plan') {
    const reviewed = reviewDraft(root, state, stage, draftFile, runners.review)
    if ('response' in reviewed) return reviewed.response
    review = reviewed.summary
  }

  const resultFile = join(root, 'tmp', 'flow-results', `${state.id}.${stage}.${randomUUID()}.json`)
  if (repoRelative(root, root, resultFile) === null) return blocked(`Путь результата вне репозитория: ${resultFile}.`)
  try {
    const draftHash = fileHash(root, draftFile)
    if (draftHash === null) return blocked(`Черновик не найден: ${draftFile}.`)

    mkdirSync(dirname(resultFile), { recursive: true })
    state.session = { stage, draft: draftFile, target, resultFile, draftHash, status: 'open', startedAt: now.toISOString() }
    writeState(root, state)
    try {
      runners.plannotator.start({ draft: draftFile, resultFile, cwd: root })
    } catch (error) {
      if (session) state.session = session
      else delete state.session
      writeState(root, state)
      throw error
    }
    if (session && repoRelative(root, root, session.resultFile) !== null) rmSync(session.resultFile, { force: true })
  } catch (error) {
    return blocked(`Не удалось запустить показ в Plannotator: ${(error as Error).message}`)
  }

  return { result: 'pending', task: state.id, stage, draft: draftFile, ...(review ? { review } : {}) }
}
