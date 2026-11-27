import type { AgentStageName, DocumentStageName, ImplementMethod, StageName } from './stages.mts'
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
  method?: ImplementMethod
  tracker?: 'jira'
  jiraInstance?: string
  stepDir?: string
  stages: Stage[]
  timeline?: { at: string; stage: StageName; event: 'start' | 'done' | 'skipped' | 'reset' }[]
  session?: Session
  reviews?: Partial<Record<DocumentStageName, ReviewProgress>>
  superseded?: { path: string; hash: string }[]
  drift?: Drift[]
  annotated?: DocumentStageName[]
  restarts?: { from: StageName; reason: string; at: string }[]
}

// Согласованный документ изменён, пока шла работа над более поздним документом: хеш принимает только flow sync после его approved.
export interface Drift {
  stage: DocumentStageName
  path: string
  hash: string
  since: StageName
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
  drift?: { stage: DocumentStageName; file: string }[]
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

export type SessionStage = DocumentStageName | 'review'

export interface AgentPackage {
  stage: AgentStageName | 'review' | 'pr'
  evidencePath?: string
  method?: ImplementMethod
  instructions: string[]
}

export interface AgentPackageResponse {
  result: 'ok'
  task: string
  stage: AgentStageName | 'review' | 'pr'
  agentPackage: AgentPackage
  reset?: ResetNotice
}

export interface GuardResponse {
  result: 'guard'
  decision: 'allow' | 'deny'
  message?: string
}

export type TimeResponse = { result: 'time'; task: string; days: number | null; hours: number; active: number; skipped: number; idleHours: number }

export type FlowResponse = TimeResponse | GuardResponse | OkResponse | AgentPackageResponse | PackageResponse | ValidResponse | BlockedResponse | NeedsInputResponse | PendingResponse | DecisionResponse | ReviewFeedbackResponse

export interface Session {
  stage: SessionStage
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
  stage: SessionStage
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
  stage: SessionStage
}

export type DecisionResponse = DecisionContext & (
  | { result: 'approved'; target: string; feedback?: string; instruction?: string }
  | { result: 'annotated'; feedback: string; annotationCount?: number; instruction?: string }
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
