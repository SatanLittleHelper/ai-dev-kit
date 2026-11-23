import type { DocumentStageName } from '../stages.mts'
import { checkPlan } from './plan.mts'
import type { PlanContext } from './plan.mts'
import { checkSpec } from './spec.mts'
import { checkTestPlan } from './test-plan.mts'

export type { PlanContext }

export function validateDocument(stage: DocumentStageName, markdown: string, context: PlanContext): { problems: string[]; taskCount?: number } {
  if (stage === 'spec') return { problems: checkSpec(markdown) }
  if (stage === 'test-plan') return { problems: checkTestPlan(markdown) }

  return checkPlan(markdown, context)
}
