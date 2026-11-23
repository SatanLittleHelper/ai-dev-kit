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
  tracker?: 'jira'
  jiraInstance?: string
  stepDir?: string
  stages: Stage[]
  session?: Session
  reviews?: Partial<Record<DocumentStageName, ReviewProgress>>
  superseded?: { path: string; hash: string }[]
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

export type FlowResponse = OkResponse | PackageResponse | ValidResponse | BlockedResponse | NeedsInputResponse | PendingResponse | DecisionResponse | ReviewFeedbackResponse

export interface Session {
  stage: DocumentStageName
  draft: string
  target: string
  resultFile: string
  draftHash: string
  status: 'open' | 'resolved' | 'stale' | 'closed'
  startedAt: string
  feedback?: string
}

export interface PendingResponse {
  result: 'pending'
  task: string
  stage: DocumentStageName
  draft: string
  review?: ReviewSummary
  reset?: ResetNotice
}

export type ReviewProgress = { draft: string } & (
  | { status: 'running' | 'done' | 'exhausted' }
  | { status: 'finishing'; summary: ReviewSummary; reason: 'converged' | 'cap-hit' }
)

export interface ReviewSummary {
  iter: number
  max: number
  verdict: string
  converged: boolean
  blocking: number
  reportPath: string
}

interface DecisionContext {
  task: string
  stage: DocumentStageName
}

export type DecisionResponse = DecisionContext & (
  | { result: 'approved'; target: string; feedback?: string }
  | { result: 'annotated'; feedback: string; annotationCount?: number }
  | { result: 'dismissed' }
)

export interface ReviewFeedbackResponse {
  result: 'review-feedback'
  task: string
  stage: DocumentStageName
  iter: number
  max: number
  verdict: string
  blocking: number
  reportPath: string
  instruction: string
}
