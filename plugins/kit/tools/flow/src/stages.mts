export const STAGE_NAMES = ['ticket', 'in-progress', 'spec', 'test-plan', 'plan', 'implement', 'simplify', 'check', 'local-test', 'review', 'pr'] as const

export type StageName = (typeof STAGE_NAMES)[number]

// Стадии, закрываемые согласованным документом: для них запоминается хеш файла.
export const DOCUMENT_STAGES: ReadonlySet<StageName> = new Set<StageName>(['spec', 'test-plan', 'plan'])

export type DocumentStageName = 'spec' | 'test-plan' | 'plan'

export const isDocumentStage = (name: StageName): name is DocumentStageName => DOCUMENT_STAGES.has(name)

export const AGENT_STAGES: ReadonlySet<StageName> = new Set<StageName>(['implement', 'simplify', 'check', 'local-test'])

export type AgentStageName = 'implement' | 'simplify' | 'check' | 'local-test'

export const isAgentStage = (name: StageName): name is AgentStageName => AGENT_STAGES.has(name)

export const IMPLEMENT_METHODS = ['inline', 'subagent-driven-development', 'codex-implement'] as const

export type ImplementMethod = (typeof IMPLEMENT_METHODS)[number]
