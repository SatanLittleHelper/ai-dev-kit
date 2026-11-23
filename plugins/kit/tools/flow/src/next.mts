import { instructionsFor } from './instructions.mts'
import { draftPath, targetPath } from './paths.mts'
import { blocked, currentStage } from './responses.mts'
import { loadRules } from './rules.mts'
import { detectStacks } from './stack.mts'
import { isDocumentStage } from './stages.mts'
import { loadTask } from './task-access.mts'
import type { FlowResponse, TaskState, TestPlanMode } from './types.mts'

export function testPlanMode(state: TaskState): TestPlanMode {
  const stage = state.stages.find(candidate => candidate.name === 'test-plan')
  if (stage?.status === 'done' && stage.evidence) return { mode: 'separate', path: stage.evidence }
  if (stage?.status === 'skipped' && stage.reason?.startsWith('combined')) return { mode: 'combined' }

  return { mode: 'none' }
}

export function nextPackage({ root, id, now }: { root: string; id?: string; now: Date }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  const stage = currentStage(state)
  if (stage === null) return blocked(`Задача ${state.id} завершена: рабочих пакетов больше нет.`)
  if (!isDocumentStage(stage)) return blocked(`Рабочий пакет для стадии ${stage} пока не поддерживается flow: действуйте по прежним правилам кита.`)

  const stacks = detectStacks(root)
  const loadedRules = loadRules(root, stage, stacks)
  if ('reason' in loadedRules) return blocked(loadedRules.reason)

  const testPlan = stage === 'plan' ? testPlanMode(state) : undefined

  return {
    result: 'ok',
    task: state.id,
    stage,
    package: {
      stage,
      draftPath: draftPath(root, state, stage),
      targetPath: targetPath(state, stage, now),
      language: 'ru',
      stacks,
      ...(testPlan ? { testPlan } : {}),
      rulesDir: loadedRules.dir,
      rules: loadedRules.rules,
      instructions: instructionsFor(stage, stacks, testPlan),
    },
    ...(reset ? { reset } : {}),
  }
}
