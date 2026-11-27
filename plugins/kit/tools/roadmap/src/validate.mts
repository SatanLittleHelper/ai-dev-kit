import { readFileSync } from 'node:fs'
import { isLocated, selectRoadmap, findRoadmaps } from './files.mts'
import type { RoadmapState } from './model.mts'
import { parseRoadmap } from './parse.mts'
import { blocked, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { readState, statePathOf } from './state.mts'

export interface Problem { rule: string; line: number; message: string }
export type Sibling = 'missing' | { state: RoadmapState | null; ids: string[] }
export interface Context { state: RoadmapState | null; sibling(slug: string): Sibling }

export const DEFAULT_LIMIT = { metric: 'manual' as const, maxDays: 3 }

const same = (a: { min: number; max: number }, b: { min: number; max: number }): boolean => a.min === b.min && a.max === b.max

export function validateText(text: string, context: Context): Problem[] {
  const { checkpoints } = parseRoadmap(text)
  const problems: Problem[] = []
  const add = (rule: string, line: number, message: string): void => { problems.push({ rule, line, message }) }
  const limit = context.state?.limit ?? DEFAULT_LIMIT
  const ids = new Set<string>()
  for (const checkpoint of checkpoints) {
    if (ids.has(checkpoint.id)) add('duplicate-id', checkpoint.line, `Шаг «${checkpoint.id}» повторён.`)
    ids.add(checkpoint.id)
    if (checkpoint.id === 'TBD') add('flat-tbd', checkpoint.line, 'В качестве id нужен идентификатор шага (A1) или ключ задачи, а не TBD.')
    if (checkpoint.estimateMalformed) add('estimate-malformed', checkpoint.line, 'Тег (est: …) не разобран: ожидается (est: 1–3д / agent: 0.5–1д).')
    if (!checkpoint.tagOrderOk) add('tag-order', checkpoint.line, 'Порядок тегов: (Jira: …), (est: …), затем (depends: …) последним.')
    if (checkpoint.estimate && checkpoint.estimate[limit.metric].max > limit.maxDays) {
      add('limit', checkpoint.line, `Шаг «${checkpoint.id}»: ${limit.metric}.max ${checkpoint.estimate[limit.metric].max}д больше потолка ${limit.maxDays}д — разбейте шаг.`)
    }
  }

  const local = new Set(checkpoints.map(checkpoint => checkpoint.id))
  const reported = new Set<string>()
  for (const checkpoint of checkpoints) {
    for (const dependency of checkpoint.dependsOn) {
      if (dependency.includes(':')) {
        const [slug, id] = dependency.split(':')
        const other = context.sibling(slug)
        if (other === 'missing') continue
        const known = other.state ? other.state.steps.map(step => step.id) : other.ids
        if (!known.includes(id)) add('depends-broken', checkpoint.line, `Зависимость «${dependency}»: в роадмапе «${slug}» нет шага «${id}».`)
      } else if (dependency === checkpoint.id) add('depends-self', checkpoint.line, `Шаг «${dependency}» зависит от себя.`)
      else if (!local.has(dependency)) add('depends-unknown', checkpoint.line, `Зависимость «${dependency}»: такого шага в роадмапе нет.`)
    }
  }
  // Циклы: обход в глубину по локальным зависимостям.
  const graph = new Map(checkpoints.map(checkpoint => [checkpoint.id, checkpoint.dependsOn.filter(id => local.has(id) && id !== checkpoint.id)]))
  const colour = new Map<string, number>()
  const visit = (id: string): boolean => {
    colour.set(id, 1)
    for (const next of graph.get(id) ?? []) {
      if (colour.get(next) === 1) return true
      if (!colour.has(next) && visit(next)) return true
    }
    colour.set(id, 2)
    return false
  }
  for (const id of graph.keys()) {
    if (!colour.has(id) && visit(id) && !reported.has('cycle')) {
      reported.add('cycle')
      add('depends-cycle', checkpoints.find(checkpoint => checkpoint.id === id)!.line, 'В зависимостях есть цикл.')
    }
  }

  if (context.state) {
    const steps = new Map(context.state.steps.map(step => [step.id, step]))
    for (const checkpoint of checkpoints) {
      const step = steps.get(checkpoint.id)
      if (!step) {
        add('state-missing-step', checkpoint.line, `Шага «${checkpoint.id}» нет в roadmap-state.json.`)
        continue
      }
      if (JSON.stringify(step.dependsOn) !== JSON.stringify(checkpoint.dependsOn)) add('state-depends', checkpoint.line, `dependsOn шага «${checkpoint.id}» расходится с тегом (depends: …).`)
      const stored = step.estimate
      const tagged = checkpoint.estimate
      if (Boolean(stored) !== Boolean(tagged) || (stored && tagged && !(same(stored.manual, tagged.manual) && same(stored.agent, tagged.agent)))) {
        add('state-estimate', checkpoint.line, `Оценка шага «${checkpoint.id}» в состоянии расходится с тегом (est: …).`)
      }
    }
    for (const step of context.state.steps) {
      if (!local.has(step.id)) add('state-extra-step', 1, `В roadmap-state.json есть шаг «${step.id}», которого нет в роадмапе.`)
    }
  }
  return problems.sort((a, b) => a.line - b.line)
}

export function siblingLookup(root: string): (slug: string) => Sibling {
  return slug => {
    const found = findRoadmaps(root).find(item => item.slug === slug)
    if (!found) return 'missing'
    return { state: readState(statePathOf(root, slug)), ids: parseRoadmap(readFileSync(found.mdPath, 'utf8')).checkpoints.map(checkpoint => checkpoint.id) }
  }
}

export function validateCommand(root: string, slug?: string): Response {
  const located = selectRoadmap(root, slug)
  if (!isLocated(located)) return located
  const problems = validateText(readFileSync(located.mdPath, 'utf8'), { state: readState(located.statePath), sibling: siblingLookup(root) })
  return problems.length === 0 ? ok({ roadmap: located.slug, problems: [] }) : { ...blocked(`Найдено проблем: ${problems.length}.`), problems } as Response
}
