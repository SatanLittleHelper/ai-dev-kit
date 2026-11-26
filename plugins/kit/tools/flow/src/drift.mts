import { fileHash } from './evidence.mts'
import { blocked, currentStage, ok } from './responses.mts'
import { writeState } from './store.mts'
import { loadTask, withTaskLock } from './task-access.mts'
import type { BlockedResponse, Drift, FlowResponse, TaskState } from './types.mts'

const describe = (entries: Drift[]): string => entries.map(entry => `${entry.stage} (${entry.path})`).join(', ')

// Расхождения, которые уже пора принять: документ, во время которого они возникли, получил approved.
export const dueDrift = (state: TaskState): Drift[] => (state.drift ?? []).filter(entry => entry.since !== currentStage(state))

// Пока расхождения не приняты, стадии не двигаются: согласованные документы должны быть приведены к последнему согласованному.
export function syncBlock(state: TaskState): BlockedResponse | undefined {
  const due = dueDrift(state)
  if (due.length === 0) return undefined

  return blocked(`Документы расходятся с согласованным: ${describe(due)}. Приведите их к согласованному документу (правьте только то, что ему противоречит), затем выполните flow sync.`)
}

export function syncDrift({ root, id }: { root: string; id?: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const task = loaded.state.id
  return withTaskLock(root, task, () => sync(root, task))
}

function sync(root: string, id: string): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  const entries = state.drift ?? []
  if (entries.length === 0) return blocked('Расхождений нет: синхронизировать нечего.')

  const waiting = entries.filter(entry => entry.since === currentStage(state))
  if (waiting.length > 0) return blocked(`Синхронизация возможна только после approved документа стадии ${waiting[0].since}: сначала получите согласование.`)

  const hashes = entries.map(entry => fileHash(root, entry.path))
  if (hashes.includes(null)) return blocked(`Файл документа не найден: ${entries[hashes.indexOf(null)].path}.`)

  for (const [index, entry] of entries.entries()) {
    const stage = state.stages.find(candidate => candidate.name === entry.stage)
    if (stage) stage.hash = hashes[index] as string
  }
  delete state.drift
  writeState(root, state)

  return ok(state, reset)
}
