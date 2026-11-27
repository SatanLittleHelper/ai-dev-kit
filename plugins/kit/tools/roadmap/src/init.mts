import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { applyTable, totals } from './estimate.mts'
import { isLocated, selectRoadmap } from './files.mts'
import type { Roadmap, RoadmapState, Step } from './model.mts'
import { parseRoadmap } from './parse.mts'
import { blocked, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { readState, writeState } from './state.mts'

export function buildState(slug: string, roadmapPath: string, roadmap: Roadmap, limit?: RoadmapState['limit']): RoadmapState {
  const steps: Step[] = roadmap.checkpoints.map(checkpoint => ({
    id: checkpoint.id,
    title: checkpoint.title,
    ticket: checkpoint.ticket ?? 'TBD',
    dependsOn: checkpoint.dependsOn,
    estimate: checkpoint.estimate ? { ...checkpoint.estimate, basis: 'initial', actualDays: null } : null,
    stepFolder: null,
    status: checkpoint.checked ? 'closed' : 'not-started',
    specPath: null,
    testPlanPath: null,
    planPath: null,
  }))
  return { feature: slug, roadmapPath, updatedAt: new Date().toISOString(), ...(limit ? { limit } : {}), steps }
}

export function initCommand(root: string, slug?: string): Response {
  const located = selectRoadmap(root, slug)
  if (!isLocated(located)) return located
  if (readState(located.statePath)) return blocked(`${located.statePath} уже существует: init его не затирает.`)
  const text = readFileSync(located.mdPath, 'utf8')
  const state = buildState(located.slug, relative(root, located.mdPath), parseRoadmap(text))
  writeFileSync(located.mdPath, applyTable(text.replace(/\r\n/g, '\n').split('\n'), totals(state.steps)).join('\n'))
  writeState(located.statePath, state)
  return ok({ roadmap: located.slug, steps: state.steps.length })
}
