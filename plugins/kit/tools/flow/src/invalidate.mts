import { fileHash } from './evidence.mts'
import { isDocumentStage } from './stages.mts'
import type { ResetNotice, TaskState } from './types.mts'

// Находит первую стадию, чей документ изменился или удалён после согласования, и возвращает в «ожидает» её и все последующие.
export function invalidate(root: string, state: TaskState): ResetNotice | undefined {
  for (const [index, stage] of state.stages.entries()) {
    if (stage.hash === undefined || stage.evidence === undefined) continue

    const current = fileHash(root, stage.evidence)
    if (current === stage.hash) continue

    const file = stage.evidence
    const reset = state.stages.slice(index)
    if (state.session && reset.some(target => target.name === state.session?.stage)) delete state.session
    for (const target of reset) {
      if (isDocumentStage(target.name) && state.reviews) delete state.reviews[target.name]
      if (target.hash !== undefined && target.evidence !== undefined) {
        const hash = target === stage ? current : fileHash(root, target.evidence)
        const superseded = (state.superseded ?? []).filter(entry => entry.path !== target.evidence)
        state.superseded = hash === null ? superseded : [...superseded, { path: target.evidence, hash }]
      }
      target.status = 'pending'
      delete target.reason
      delete target.evidence
      delete target.hash
    }

    return { file, reason: current === null ? 'deleted' : 'changed', stages: reset.map(target => target.name) }
  }

  return undefined
}
