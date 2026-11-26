import { mkdirSync, rmdirSync } from 'node:fs'
import { invalidate } from './invalidate.mts'
import { blocked, currentStage } from './responses.mts'
import { CorruptedState, listStates, readState, statePath, writeState } from './store.mts'
import type { BlockedResponse, FlowResponse, NeedsInputResponse, ResetNotice, TaskState } from './types.mts'

export type Loaded = { state: TaskState; reset?: ResetNotice } | { response: BlockedResponse | NeedsInputResponse }

function select({ root, id }: { root: string; id?: string }): Loaded {
  if (id !== undefined) {
    const state = readState(root, id)
    return state ? { state } : { response: blocked(`Задача ${id} не найдена.`) }
  }

  const states = listStates(root)
  if (states.length === 0) return { response: blocked('Задача не начата. Выполните: flow start <id>.') }

  const open = states.filter(state => currentStage(state) !== null)
  if (open.length === 0) return { response: blocked('Все задачи завершены. Укажите --task <id> или начните новую: flow start <id>.') }
  if (open.length > 1) return { response: { result: 'needs-input', question: 'Какая задача имеется в виду?', options: open.map(state => state.id) } }

  return { state: open[0] }
}

export function loadTask({ root, id }: { root: string; id?: string }): Loaded {
  try {
    const selected = select({ root, id })
    if (!('state' in selected)) return selected

    const before = JSON.stringify(selected.state.drift)
    const reset = invalidate(root, selected.state)
    if (reset || JSON.stringify(selected.state.drift) !== before) writeState(root, selected.state)

    return { state: selected.state, reset }
  } catch (error) {
    if (error instanceof CorruptedState) return { response: blocked(id === undefined ? `${error.message}. Укажите --task <id>, чтобы работать с исправной задачей.` : error.message) }
    throw error
  }
}

export function withTaskLock(root: string, id: string, operation: () => FlowResponse): FlowResponse {
  const lock = `${statePath(root, id)}.lock`
  try {
    mkdirSync(lock)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return blocked(`Задача ${id} уже обрабатывается. Повторите команду после завершения операции. Если процесс был прерван, проверьте блокировку ${lock}.`)
    throw error
  }
  try {
    return operation()
  } finally {
    rmdirSync(lock)
  }
}
