import { readFileSync, writeFileSync } from 'node:fs'
import type { Checkpoint, Estimate, Range, Step } from './model.mts'
import { isLocated, selectRoadmap } from './files.mts'
import { parseRoadmap } from './parse.mts'
import { blocked, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { readState, writeState } from './state.mts'

export interface Pair { manual: Range; agent: Range }
export interface Totals { sum: Pair; critical: Pair; remaining: Pair; crossRoadmap: boolean }

export const fmt = (value: number): string => String(Number(value.toFixed(2)))
export const rangeText = (range: Range): string => `${fmt(range.min)}–${fmt(range.max)}д`
export const estimateTag = (estimate: Pair): string => `(est: ${rangeText(estimate.manual)} / agent: ${rangeText(estimate.agent)})`

const zero = (): Range => ({ min: 0, max: 0 })

function sumOf(steps: Step[]): Pair {
  const result: Pair = { manual: zero(), agent: zero() }
  for (const step of steps) {
    if (!step.estimate) continue
    for (const metric of ['manual', 'agent'] as const) {
      result[metric].min += step.estimate[metric].min
      result[metric].max += step.estimate[metric].max
    }
  }
  return result
}

function criticalOf(steps: Step[], metric: 'manual' | 'agent'): Range {
  const byId = new Map(steps.map(step => [step.id, step]))
  const memo = new Map<string, Range>()
  const visiting = new Set<string>()
  const walk = (id: string): Range => {
    const known = memo.get(id)
    if (known) return known
    if (visiting.has(id)) return zero()
    visiting.add(id)
    let best = zero()
    for (const dependency of byId.get(id)!.dependsOn) {
      if (!byId.has(dependency)) continue
      const candidate = walk(dependency)
      if (candidate.max > best.max) best = candidate
    }
    visiting.delete(id)
    const own = byId.get(id)!.estimate![metric]
    const result = { min: best.min + own.min, max: best.max + own.max }
    memo.set(id, result)
    return result
  }
  let top = zero()
  for (const step of steps) {
    const candidate = walk(step.id)
    if (candidate.max > top.max) top = candidate
  }
  return top
}

export function totals(steps: Step[]): Totals {
  const estimated = steps.filter(step => step.estimate)
  return {
    sum: sumOf(estimated),
    critical: { manual: criticalOf(estimated, 'manual'), agent: criticalOf(estimated, 'agent') },
    remaining: sumOf(estimated.filter(step => step.status !== 'closed')),
    crossRoadmap: estimated.some(step => step.dependsOn.some(id => id.includes(':'))),
  }
}

const CROSS_NOTE = 'Межроадмапные зависимости в критическом пути не учтены.'

function tableLines(result: Totals): string[] {
  const row = (label: string, pair: Pair): string => `| ${label} | ${rangeText(pair.manual)} | ${rangeText(pair.agent)} |`
  return [
    '| Показатель | Вручную | С агентом |',
    '|---|---|---|',
    row('Сумма по шагам', result.sum),
    row('Критический путь (depends)', result.critical),
    row('Осталось (незакрытые шаги)', result.remaining),
    ...(result.crossRoadmap ? ['', CROSS_NOTE] : []),
  ]
}

// Заменяет таблицу в «## Оценка» (и необязательную строку про межроадмапные зависимости); остальной текст раздела не трогает.
export function applyTable(lines: string[], result: Totals): string[] {
  const heading = lines.findIndex(line => /^## Оценка\s*$/.test(line))
  const table = tableLines(result)
  if (heading < 0) {
    const risks = lines.findIndex(line => /^## Сквозные риски/.test(line))
    const insertAt = risks >= 0 ? risks : lines.length
    return [...lines.slice(0, insertAt), '## Оценка', '', ...table, '', ...lines.slice(insertAt)]
  }
  let start = heading + 1
  while (start < lines.length && lines[start].trim() === '') start += 1
  let end = start
  while (end < lines.length && lines[end].startsWith('|')) end += 1
  if (end > start && lines[end] === '' && lines[end + 1] === CROSS_NOTE) end += 2
  else if (lines[end] === CROSS_NOTE) end += 1
  return [...lines.slice(0, start), ...table, ...lines.slice(end)]
}

// Приводит теги (est: …) в строках чек-листа в соответствие с состоянием; шагу без тега тег добавляется перед (depends: …) или в конец.
export function syncTags(lines: string[], steps: Step[], checkpoints: Checkpoint[]): string[] {
  const result = [...lines]
  for (const checkpoint of checkpoints) {
    const step = steps.find(candidate => candidate.id === checkpoint.id)
    if (!step?.estimate) continue
    const tag = estimateTag(step.estimate)
    const line = result[checkpoint.line - 1]
    if (/\(est:[^)]*\)/.test(line)) result[checkpoint.line - 1] = line.replace(/\(est:[^)]*\)/, tag)
    else if (/\(depends:/.test(line)) result[checkpoint.line - 1] = line.replace(/\s*\(depends:/, ` ${tag} (depends:`)
    else result[checkpoint.line - 1] = `${line} ${tag}`
  }
  return result
}

export function estimateCommand(root: string, slug?: string): Response {
  const located = selectRoadmap(root, slug)
  if (!isLocated(located)) return located
  const state = readState(located.statePath)
  if (!state) return blocked(`Нет ${located.statePath}: сначала roadmap init ${located.slug}.`)
  const roadmap = parseRoadmap(readFileSync(located.mdPath, 'utf8'))
  const lines = readFileSync(located.mdPath, 'utf8').replace(/\r\n/g, '\n').split('\n')
  const result = totals(state.steps)
  const next = applyTable(syncTags(lines, state.steps, roadmap.checkpoints), result)
  writeFileSync(located.mdPath, next.join('\n'))
  writeState(located.statePath, state)
  return ok({ roadmap: located.slug, totals: result })
}
