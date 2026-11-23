export const STAGE_NAMES = ['ticket', 'in-progress', 'spec', 'test-plan', 'plan', 'implement', 'polish', 'local-test', 'review', 'pr'] as const

export type StageName = (typeof STAGE_NAMES)[number]

// Стадии, закрываемые согласованным документом: для них запоминается хеш файла.
export const DOCUMENT_STAGES: ReadonlySet<StageName> = new Set<StageName>(['spec', 'test-plan', 'plan'])

export type DocumentStageName = 'spec' | 'test-plan' | 'plan'

export const isDocumentStage = (name: StageName): name is DocumentStageName => DOCUMENT_STAGES.has(name)
