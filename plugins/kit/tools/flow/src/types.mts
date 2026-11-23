import type { StageName } from './stages.mts'

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

export type FlowResponse = OkResponse | BlockedResponse | NeedsInputResponse
