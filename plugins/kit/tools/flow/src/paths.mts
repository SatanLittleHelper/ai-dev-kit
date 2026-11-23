import { basename, join } from 'node:path'
import type { DocumentStageName } from './stages.mts'
import type { TaskState } from './types.mts'

const DRAFT_SUFFIX: Record<DocumentStageName, string> = { spec: 'design', 'test-plan': 'test-plan', plan: 'plan' }

export const slugOf = (state: TaskState): string => (state.stepDir ? basename(state.stepDir) : state.id.toLowerCase())

export function dateStamp(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${now.getFullYear()}-${month}-${day}`
}

export const draftPath = (root: string, state: TaskState, stage: DocumentStageName): string => join(root, 'tmp', 'drafts', `${slugOf(state)}-${DRAFT_SUFFIX[stage]}.md`)

export function targetPath(state: TaskState, stage: DocumentStageName, now: Date): string {
  const date = dateStamp(now)
  const slug = slugOf(state)

  if (state.stepDir) {
    const names: Record<DocumentStageName, string> = {
      spec: `${date}-${slug}-design.md`,
      'test-plan': `${date}-${state.id}-${slug}-tests.md`,
      plan: `${date}-${state.id}-${slug}.md`,
    }

    return `${state.stepDir}/${names[stage]}`
  }

  const paths: Record<DocumentStageName, string> = {
    spec: `docs/superpowers/specs/${date}-${slug}-design.md`,
    'test-plan': `docs/superpowers/plans/${date}-${slug}-tests.md`,
    plan: `docs/superpowers/plans/${date}-${slug}.md`,
  }

  return paths[stage]
}
