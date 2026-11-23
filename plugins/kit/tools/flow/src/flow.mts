import { isAbsolute } from 'node:path'
import { fileHash, repoRelative } from './evidence.mts'
import { blocked, currentStage, ok } from './responses.mts'
import { DOCUMENT_STAGES, STAGE_NAMES } from './stages.mts'
import type { StageName } from './stages.mts'
import { CorruptedState, isValidId, readState, writeState } from './store.mts'
import { loadTask, withTaskLock } from './task-access.mts'
import { resolveTrackedTicket } from './ticket.mts'
import type { BlockedResponse, FlowResponse, ResetNotice, Stage, TaskState } from './types.mts'

const isValidStepDir = (dir: string): boolean => dir !== '' && !isAbsolute(dir) && !dir.split(/[\\/]/).includes('..')

export function startTask({ root, id, noTracker = false, stepDir }: { root: string; id?: string; noTracker?: boolean; stepDir?: string }): FlowResponse {
  const selected = noTracker ? { key: id?.trim(), jiraInstance: undefined } : resolveTrackedTicket(root, id)
  if ('result' in selected) return selected
  const { key: taskId, jiraInstance } = selected
  if (!taskId) return blocked('id не указан. Использование: flow start <id>.')
  if (!isValidId(taskId)) return blocked(`Недопустимый id «${taskId}»: допустимы латинские буквы, цифры, точка, дефис и подчёркивание.`)

  const dir = stepDir?.trim().replace(/\/+$/, '')
  if (dir !== undefined && !isValidStepDir(dir)) return blocked(`Недопустимый --step-dir «${stepDir}»: нужен относительный путь внутри репозитория.`)

  try {
    if (readState(root, taskId)) return blocked(`Задача ${taskId} уже начата.`)
  } catch (error) {
    if (error instanceof CorruptedState) return blocked(error.message)
    throw error
  }

  // Стадия ticket закрыта сразу: id задачи известен по определению.
  const initial = (name: StageName): Stage => {
    if (name === 'ticket') return { name, status: 'done', evidence: taskId }
    if (name === 'in-progress' && noTracker) return { name, status: 'skipped', reason: 'no-tracker' }
    return { name, status: 'pending' }
  }

  const state: TaskState = {
    id: taskId,
    ...(!noTracker ? { tracker: 'jira' as const } : {}),
    ...(jiraInstance ? { jiraInstance } : {}),
    ...(dir ? { stepDir: dir } : {}),
    stages: STAGE_NAMES.map(initial),
  }
  writeState(root, state)

  return ok(state)
}

export function getStatus({ root, id }: { root: string; id?: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  return ok(loaded.state, loaded.reset)
}

// Общая проверка для закрытия и пропуска: стадия существует, ожидает и является текущей.
function selectStage(state: TaskState, stage: string): Stage | BlockedResponse {
  const target = state.stages.find(candidate => candidate.name === stage)
  if (!target) return blocked(`Неизвестная стадия «${stage}». Допустимые: ${STAGE_NAMES.join(', ')}.`)

  if (target.status !== 'pending') return blocked(`Стадия ${target.name} уже ${target.status === 'done' ? 'закрыта' : 'пропущена'}.`)

  const current = currentStage(state)
  if (current !== target.name) return blocked(`Сначала завершите стадию ${current}: стадия ${target.name} идёт позже.`)

  return target
}

export function closeStage({ root, id, stage, evidence, cwd }: { root: string; stage: string; id?: string; evidence?: string; cwd?: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  const target = selectStage(state, stage)
  if ('result' in target) return target

  const proof = evidence?.trim()
  if (!proof) return blocked(`Для закрытия стадии ${target.name} нужно доказательство.`)

  const stored = cwd === undefined ? proof : repoRelative(root, cwd, proof)
  if (stored === null) return blocked(`Путь доказательства вне репозитория: ${proof}.`)

  if (DOCUMENT_STAGES.has(target.name)) {
    const hash = fileHash(root, stored)
    if (hash === null) return blocked(`Файл не найден: ${proof}.`)

    target.hash = hash
  }

  target.status = 'done'
  target.evidence = stored
  writeState(root, state)

  return ok(state, reset)
}


export function skipStage({ root, id, stage, reason }: { root: string; stage: string; id?: string; reason?: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const task = loaded.state.id
  return withTaskLock(root, task, () => skip(root, task, stage, reason, loaded.reset))
}

function skip(root: string, id: string, stage: string, reason?: string, priorReset?: ResetNotice): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  const target = selectStage(state, stage)
  if ('result' in target) return target

  const why = reason?.trim()
  if (!why) return blocked(`Для пропуска стадии ${target.name} нужна причина.`)

  target.status = 'skipped'
  target.reason = why
  if (target.name === state.session?.stage) delete state.session
  writeState(root, state)

  return ok(state, reset ?? priorReset)
}
