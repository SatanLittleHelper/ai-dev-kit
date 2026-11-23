import { isAbsolute } from 'node:path'
import { fileHash } from './evidence.mts'
import { blocked, currentStage, ok } from './responses.mts'
import { DOCUMENT_STAGES, STAGE_NAMES } from './stages.mts'
import type { StageName } from './stages.mts'
import { CorruptedState, isValidId, readState, writeState } from './store.mts'
import { loadTask } from './task-access.mts'
import type { BlockedResponse, FlowResponse, Stage, TaskState } from './types.mts'

const isValidStepDir = (dir: string): boolean => dir !== '' && !isAbsolute(dir) && !dir.split(/[\\/]/).includes('..')

export function startTask({ root, id, noTracker = false, stepDir }: { root: string; id?: string; noTracker?: boolean; stepDir?: string }): FlowResponse {
  const taskId = id?.trim()
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

  const state: TaskState = { id: taskId, ...(dir ? { stepDir: dir } : {}), stages: STAGE_NAMES.map(initial) }
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

export function closeStage({ root, id, stage, evidence }: { root: string; stage: string; id?: string; evidence?: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  const target = selectStage(state, stage)
  if ('result' in target) return target

  const proof = evidence?.trim()
  if (!proof) return blocked(`Для закрытия стадии ${target.name} нужно доказательство.`)

  if (DOCUMENT_STAGES.has(target.name)) {
    const hash = fileHash(root, proof)
    if (hash === null) return blocked(`Файл не найден: ${proof}.`)

    target.hash = hash
  }

  target.status = 'done'
  target.evidence = proof
  writeState(root, state)

  return ok(state, reset)
}


export function skipStage({ root, id, stage, reason }: { root: string; stage: string; id?: string; reason?: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  const target = selectStage(state, stage)
  if ('result' in target) return target

  const why = reason?.trim()
  if (!why) return blocked(`Для пропуска стадии ${target.name} нужна причина.`)

  target.status = 'skipped'
  target.reason = why
  writeState(root, state)

  return ok(state, reset)
}
