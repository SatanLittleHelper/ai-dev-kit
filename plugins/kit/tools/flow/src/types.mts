import type { DocumentStageName, StageName } from './stages.mts'
import type { RuleText } from './rules.mts'
import type { Stack } from './stack.mts'

export type StageStatus = 'pending' | 'done' | 'skipped'

export interface Stage {
  name: StageName
  status: StageStatus
  reason?: string
  evidence?: string
  hash?: string
}

export interface TaskState {
  id: string
  stepDir?: string
  stages: Stage[]
}

export interface ResetNotice {
  file: string
  reason: 'changed' | 'deleted'
  stages: StageName[]
}

export interface OkResponse {
  result: 'ok'
  task: string
  stages: Stage[]
  current: StageName | null
  completed: boolean
  reset?: ResetNotice
}

export interface BlockedResponse {
  result: 'blocked'
  reason: string
}

export interface NeedsInputResponse {
  result: 'needs-input'
  question: string
  options: string[]
}

export type TestPlanMode = { mode: 'separate'; path: string } | { mode: 'combined' } | { mode: 'none' }

export interface WorkPackage {
  stage: DocumentStageName
  draftPath: string
  targetPath: string
  language: 'ru'
  stacks: Stack[]
  testPlan?: TestPlanMode
  rulesDir: string
  rules: RuleText[]
  instructions: string[]
}

export interface PackageResponse {
  result: 'ok'
  task: string
  stage: DocumentStageName
  package: WorkPackage
  reset?: ResetNotice
}

export interface ValidResponse {
  result: 'ok'
  task: string
  stage: DocumentStageName
  valid: true
  taskCount?: number
  reset?: ResetNotice
}

export type FlowResponse = OkResponse | PackageResponse | ValidResponse | BlockedResponse | NeedsInputResponse
