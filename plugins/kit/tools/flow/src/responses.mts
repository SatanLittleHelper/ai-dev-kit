import type { StageName } from './stages.mts'
import type { BlockedResponse, OkResponse, ResetNotice, TaskState } from './types.mts'

export const blocked = (reason: string): BlockedResponse => ({ result: 'blocked', reason })

// Текущая стадия — первая, не закрытая и не пропущенная.
export const currentStage = (state: TaskState): StageName | null => state.stages.find(stage => stage.status === 'pending')?.name ?? null

export function ok(state: TaskState, reset?: ResetNotice): OkResponse {
  const current = currentStage(state)
  return { result: 'ok', task: state.id, stages: state.stages, current, completed: current === null, ...(reset ? { reset } : {}), ...(state.drift?.length ? { drift: state.drift.map(entry => ({ stage: entry.stage, file: entry.path })) } : {}) }
}
