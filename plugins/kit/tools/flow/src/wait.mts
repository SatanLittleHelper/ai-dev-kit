import { createHash, randomUUID } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileHash, pathsAlias, repoRelative } from './evidence.mts'
import { parseDecision, parseReviewDecision } from './plannotator.mts'
import { blocked, currentStage } from './responses.mts'
import { writeState } from './store.mts'
import { loadTask, withTaskLock } from './task-access.mts'
import type { FlowResponse, Session, TaskState } from './types.mts'

export const sleepSync = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function waitForDecision({ root, id, timeoutMs, sleep = sleepSync }: { root: string; id?: string; timeoutMs: number; sleep?: (ms: number) => void }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const task = loaded.state.id
  const session = loaded.state.session
  if (!session) return noSession()
  if (session.status === 'stale') return staleDraft()
  if (repoRelative(root, root, session.resultFile) === null) return noSession()

  const deadline = Date.now() + timeoutMs
  while (session.status !== 'closed' && !existsSync(session.resultFile)) {
    if (Date.now() >= deadline) return { result: 'pending', task, stage: session.stage, draft: session.draft }

    sleep(Math.min(500, Math.max(1, deadline - Date.now())))
  }

  return withTaskLock(root, task, () => consumeDecision(root, task, session.resultFile))
}

function noSession(): FlowResponse {
  return blocked('Показ не запускался. Сначала выполните: flow submit.')
}

function staleDraft(): FlowResponse {
  return blocked('Черновик удалён или изменён после показа в Plannotator. Повторите flow submit.')
}

function consumeDecision(root: string, id: string, resultFile: string): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state } = loaded
  const session = state.session
  if (!session) return noSession()
  if (session.status === 'stale') return staleDraft()
  if (session.resultFile !== resultFile) return blocked('Сессия Plannotator сменилась. Повторите flow wait.')
  if (session.status === 'closed') {
    removeApprovedDraft(root, session)
    return approved(state.id, session)
  }

  let raw: string
  try {
    raw = readFileSync(session.resultFile, 'utf8')
  } catch (error) {
    return blocked(`Не удалось прочитать результат Plannotator: ${(error as Error).message}`)
  }
  const decision = session.stage === 'review' ? parseReviewDecision(raw) : parseDecision(raw)
  if (decision.kind !== 'approved' && session.status === 'open') {
    session.status = 'resolved'
    writeState(root, state)
  }

  if (decision.kind === 'invalid') return blocked(`Не удалось разобрать ответ Plannotator: ${decision.error ?? session.resultFile}.`)
  if (decision.kind === 'nothing-to-send') {
    return { result: 'needs-input', question: 'Plannotator вернул «нет замечаний» без решения. Документ согласован? Для согласования нужно нажать Approve.', options: ['Да, согласован', 'Нет, жду замечаний'] }
  }
  if (decision.kind === 'dismissed') return { result: 'dismissed', task: state.id, stage: session.stage }
  if (decision.kind === 'annotated') return { result: 'annotated', task: state.id, stage: session.stage, feedback: decision.feedback, ...(decision.annotationCount === undefined ? {} : { annotationCount: decision.annotationCount }) }

  return finalize(root, state, session, decision.feedback)
}

function approved(id: string, session: Session): FlowResponse {
  return { result: 'approved', task: id, stage: session.stage, target: session.target, ...(session.feedback ? { feedback: session.feedback } : {}) }
}

function removeApprovedDraft(root: string, session: Session): void {
  if (repoRelative(root, root, session.draft) === null || pathsAlias(resolve(root, session.target), session.draft)) return
  if (fileHash(root, session.draft) !== session.draftHash) return
  rmSync(session.draft, { force: true })
}

function finalize(root: string, state: TaskState, session: Session, feedback?: string): FlowResponse {
  if (session.stage === 'review') return finalizeReview(root, state, session, feedback)
  const stage = state.stages.find(candidate => candidate.name === session.stage)
  if (!stage || currentStage(state) !== stage.name) return blocked(`Стадия ${session.stage} уже не ожидает согласования.`)

  const target = resolve(root, session.target)
  if (repoRelative(root, root, target) === null) return blocked(`Целевой путь вне репозитория: ${session.target}.`)
  const draft = repoRelative(root, root, session.draft)
  if (draft === null || pathsAlias(target, session.draft)) return blocked(`Недопустимый путь черновика: ${session.draft}.`)

  try {
    const bytes = existsSync(session.draft) ? readFileSync(session.draft) : null
    const hash = bytes && createHash('sha256').update(bytes).digest('hex')
    if (!bytes || hash !== session.draftHash) {
      session.status = 'stale'
      writeState(root, state)
      return staleDraft()
    }

    const previous = fileHash(root, target)
    const owned = state.superseded?.some(entry => entry.path === session.target && entry.hash === previous)
    if (existsSync(target) && previous !== hash && !owned) return blocked(`Целевой файл уже существует и отличается от черновика: ${session.target}.`)

    if (previous !== hash) {
      mkdirSync(dirname(target), { recursive: true })
      const temporary = `${target}.${randomUUID()}.tmp`
      try {
        writeFileSync(temporary, bytes, { flag: 'wx' })
        if (owned) {
          if (fileHash(root, target) !== previous) return blocked(`Целевой файл изменился: ${session.target}.`)
          renameSync(temporary, target)
        } else {
          linkSync(temporary, target)
        }
      } finally {
        rmSync(temporary, { force: true })
      }
    }

    stage.status = 'done'
    stage.evidence = session.target
    stage.hash = hash
    session.status = 'closed'
    if (feedback) session.feedback = feedback
    if (state.superseded) state.superseded = state.superseded.filter(entry => entry.path !== session.target)
    writeState(root, state)
    removeApprovedDraft(root, session)

    return approved(state.id, session)
  } catch (error) {
    return blocked(`Не удалось сохранить согласование стадии ${stage.name}: ${(error as Error).message}`)
  }
}

function finalizeReview(root: string, state: TaskState, session: Session, feedback?: string): FlowResponse {
  const stage = state.stages.find(candidate => candidate.name === 'review')
  if (!stage || currentStage(state) !== 'review') return blocked('Стадия review уже не ожидает ревью кода.')

  stage.status = 'done'
  stage.evidence = session.target
  session.status = 'closed'
  if (feedback) session.feedback = feedback
  writeState(root, state)

  return approved(state.id, session)
}
