import { rmSync } from 'node:fs'
import { draftPath } from './paths.mts'
import { blocked, ok } from './responses.mts'
import { isDocumentStage, STAGE_NAMES } from './stages.mts'
import type { StageName } from './stages.mts'
import { writeState } from './store.mts'
import { loadTask, withTaskLock } from './task-access.mts'
import type { FlowResponse } from './types.mts'

// Перезапуск с нуля: задача оказалась другой, поэтому документы указанной стадии и всех следующих пишутся заново.
export function restartStage({ root, id, stage, reason, now }: { root: string; id?: string; stage: string; reason?: string; now: Date }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const task = loaded.state.id
  return withTaskLock(root, task, () => restart(root, task, stage, reason, now))
}

function restart(root: string, id: string, stage: string, reason: string | undefined, now: Date): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  if (!(STAGE_NAMES as readonly string[]).includes(stage)) return blocked(`Неизвестная стадия «${stage}». Допустимые: ${STAGE_NAMES.join(', ')}.`)
  if (!isDocumentStage(stage as StageName)) return blocked('Перезапуск возможен с документной стадии: spec, test-plan или plan.')

  const why = reason?.trim()
  if (!why) return blocked(`Для перезапуска стадии ${stage} нужна причина.`)

  const from = state.stages.findIndex(candidate => candidate.name === stage)
  const stages = state.stages.slice(from)
  for (const target of stages) {
    if (isDocumentStage(target.name)) {
      if (state.reviews) delete state.reviews[target.name]
      rmSync(draftPath(root, state, target.name), { force: true })
    }
    target.status = 'pending'
    delete target.reason
    delete target.evidence
    delete target.hash
  }
  delete state.method
  delete state.session
  if (state.drift) {
    state.drift = state.drift.filter(entry => !stages.some(target => target.name === entry.stage))
    if (state.drift.length === 0) delete state.drift
  }
  state.restarts = [...(state.restarts ?? []), { from: stage as StageName, reason: why, at: now.toISOString() }]
  writeState(root, state)

  return ok(state, reset)
}
