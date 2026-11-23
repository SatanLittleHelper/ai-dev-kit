import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TaskState } from './types.mts'

const ORDER = ['not-started', 'spec-drafted', 'spec-validated', 'plan-drafted', 'implemented', 'closed']

interface RoadmapStep {
  id?: string
  status?: string
  stepFolder?: string | null
  specPath?: string | null
  testPlanPath?: string | null
  planPath?: string | null
}

const evidenceOf = (state: TaskState, name: string): string | undefined => {
  const stage = state.stages.find(candidate => candidate.name === name)
  return stage?.status === 'done' && stage.evidence ? stage.evidence : undefined
}

// Статус шага по закрытым стадиям задачи; undefined, если flow пока ничего не подтвердил.
function derivedStatus(state: TaskState): string | undefined {
  if (evidenceOf(state, 'implement') !== undefined) return 'implemented'
  if (evidenceOf(state, 'plan') !== undefined) return 'plan-drafted'
  if (evidenceOf(state, 'spec') !== undefined) return 'spec-validated'
  return undefined
}

function sync(root: string, state: TaskState): void {
  if (!state.stepDir) return

  const folder = `${state.stepDir.replace(/\/+$/, '')}/`
  const file = join(root, dirname(dirname(state.stepDir.replace(/\/+$/, ''))), 'roadmap-state.json')
  if (!existsSync(file)) return

  const text = readFileSync(file, 'utf8')
  const roadmap = JSON.parse(text) as { steps?: RoadmapStep[]; updatedAt?: string }
  const steps = roadmap.steps ?? []
  const step = steps.find(candidate => candidate.stepFolder === folder) ?? steps.find(candidate => candidate.id === state.id && !candidate.stepFolder)
  if (!step || step.status === 'closed') return

  step.stepFolder = folder
  const spec = evidenceOf(state, 'spec')
  const testPlan = evidenceOf(state, 'test-plan')
  const plan = evidenceOf(state, 'plan')
  if (spec !== undefined) step.specPath = spec
  if (testPlan !== undefined) step.testPlanPath = testPlan
  if (plan !== undefined) step.planPath = plan

  const status = derivedStatus(state)
  if (status !== undefined && ORDER.indexOf(status) > ORDER.indexOf(step.status ?? 'not-started')) step.status = status

  const original = JSON.parse(text) as typeof roadmap
  if (JSON.stringify({ ...original, updatedAt: undefined }) === JSON.stringify({ ...roadmap, updatedAt: undefined })) return

  roadmap.updatedAt = new Date().toISOString()
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(roadmap, null, 2)}\n`)
  renameSync(temporary, file)
}

// Состояние роадмапа вторично: любой сбой (чужой файл, права, JSON) не должен мешать работе flow.
export function syncRoadmapState(root: string, state: TaskState): void {
  try {
    sync(root, state)
  } catch {
    // намеренно пусто
  }
}
