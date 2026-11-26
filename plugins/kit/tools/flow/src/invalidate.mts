import { fileHash } from './evidence.mts'
import { isDocumentStage } from './stages.mts'
import type { DocumentStageName } from './stages.mts'
import type { ResetNotice, TaskState } from './types.mts'

// Находит первую стадию, чей документ изменился или удалён после согласования, и возвращает в «ожидает» её и все последующие.
// Согласованный документ, изменённый во время работы над более поздним документом (или уже отмеченный расхождением), стадий не сбрасывает:
// изменение запоминается, а принимает его flow sync после approved текущего документа.
function recordDrift(state: TaskState, stage: TaskState['stages'][number], hash: string): boolean {
  if (!isDocumentStage(stage.name) || stage.evidence === undefined) return false

  const known = state.drift?.find(entry => entry.stage === stage.name)
  if (known) {
    known.hash = hash
    return true
  }

  const current = state.stages.findIndex(candidate => candidate.status === 'pending')
  if (current < 0 || current <= state.stages.indexOf(stage) || !isDocumentStage(state.stages[current].name)) return false

  const entry = { stage: stage.name as DocumentStageName, path: stage.evidence, hash, since: state.stages[current].name }
  state.drift = [...(state.drift ?? []).filter(other => other.stage !== entry.stage), entry]
  return true
}

export function invalidate(root: string, state: TaskState): ResetNotice | undefined {
  const reviewed = state.stages.some(candidate => candidate.name === 'review' && candidate.status === 'done')
  for (const [index, stage] of state.stages.entries()) {
    if (stage.hash === undefined || stage.evidence === undefined) continue

    const current = fileHash(root, stage.evidence)
    if (current === stage.hash) continue
    if (current === null && reviewed && (stage.name === 'plan' || stage.name === 'test-plan')) continue

    if (current !== null && recordDrift(state, stage, current)) continue

    const file = stage.evidence
    const reset = state.stages.slice(index)
    if (state.session && reset.some(target => target.name === state.session?.stage)) delete state.session
    if (state.drift) {
      state.drift = state.drift.filter(entry => !reset.some(target => target.name === entry.stage))
      if (state.drift.length === 0) delete state.drift
    }
    for (const target of reset) {
      if (target.name === 'implement') delete state.method
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
