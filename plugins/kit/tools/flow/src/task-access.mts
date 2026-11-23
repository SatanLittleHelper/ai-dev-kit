import { invalidate } from './invalidate.mts'
import { blocked, currentStage } from './responses.mts'
import { CorruptedState, listStates, readState, writeState } from './store.mts'
import type { BlockedResponse, NeedsInputResponse, ResetNotice, TaskState } from './types.mts'

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

    const reset = invalidate(root, selected.state)
    if (reset) writeState(root, selected.state)

    return { state: selected.state, reset }
  } catch (error) {
    if (error instanceof CorruptedState) return { response: blocked(error.message) }
    throw error
  }
}
