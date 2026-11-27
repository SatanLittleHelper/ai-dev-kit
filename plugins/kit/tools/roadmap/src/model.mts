export interface Range { min: number; max: number }
export interface Estimate { manual: Range; agent: Range; basis: string; actualDays: number | null }
export interface Checkpoint {
  id: string
  title: string
  checked: boolean
  line: number // номер строки в файле, с 1
  ticket: string | null // из (Jira: …); null — тега нет
  estimate: { manual: Range; agent: Range } | null
  estimateMalformed: boolean
  dependsOn: string[]
  tagOrderOk: boolean // (est) раньше (depends), (depends) — последним тегом
  scope: string // «Объём:»
  done: string // «Готово, когда:»
}
export interface Roadmap { title: string; context: string; checkpoints: Checkpoint[] }
export interface Step {
  id: string; title: string; ticket: string; dependsOn: string[]; estimate: Estimate | null
  stepFolder: string | null; status: string; specPath: string | null; testPlanPath: string | null; planPath: string | null
  [extra: string]: unknown
}
export interface RoadmapState {
  feature: string; roadmapPath: string; updatedAt: string
  limit?: { metric: 'manual' | 'agent'; maxDays: number }
  story?: { key: string; url: string }
  steps: Step[]
  [extra: string]: unknown
}
