import { isLocated, selectRoadmap } from './files.mts'
import { blocked, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { readState, writeState } from './state.mts'

export const STATUS_ORDER = ['not-started', 'spec-drafted', 'spec-validated', 'plan-drafted', 'implemented', 'closed']

export function markCommand(root: string, id: string | undefined, options: { slug?: string; status?: string; spec?: string; plan?: string }): Response {
  if (!id || !options.status) return blocked('Использование: roadmap mark <id> --status <статус> [--spec <путь>] [--plan <путь>] [--slug …].')
  if (!STATUS_ORDER.includes(options.status)) return blocked(`Неизвестный статус «${options.status}». Допустимые: ${STATUS_ORDER.join(', ')}.`)
  if (options.status === 'closed') return blocked('Статус closed ставит только roadmap close.')
  const located = selectRoadmap(root, options.slug)
  if (!isLocated(located)) return located
  const state = readState(located.statePath)
  const step = state?.steps.find(candidate => candidate.id === id)
  if (!state || !step) return blocked(`Шага «${id}» нет в roadmap-state.json роадмапа «${located.slug}».`)
  if (STATUS_ORDER.indexOf(options.status) < STATUS_ORDER.indexOf(step.status)) return blocked(`Статус не понижается: «${step.status}» → «${options.status}».`)
  step.status = options.status
  if (options.spec) step.specPath = options.spec
  if (options.plan) step.planPath = options.plan
  writeState(located.statePath, state)
  return ok({ roadmap: located.slug, id, status: step.status })
}
