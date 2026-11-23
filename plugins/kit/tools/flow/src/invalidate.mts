import { fileHash } from './evidence.mts'
import type { ResetNotice, TaskState } from './types.mts'

// Находит первую стадию, чей документ изменился или удалён после согласования, и возвращает в «ожидает» её и все последующие.
export function invalidate(root: string, state: TaskState): ResetNotice | undefined {
  for (const [index, stage] of state.stages.entries()) {
    if (stage.hash === undefined || stage.evidence === undefined) continue

    const current = fileHash(root, stage.evidence)
    if (current === stage.hash) continue

    const file = stage.evidence
    const reset = state.stages.slice(index)
    for (const target of reset) {
      target.status = 'pending'
      delete target.reason
      delete target.evidence
      delete target.hash
    }

    return { file, reason: current === null ? 'deleted' : 'changed', stages: reset.map(target => target.name) }
  }

  return undefined
}
