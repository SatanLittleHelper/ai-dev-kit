import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { applyTable, totals } from './estimate.mts'
import { findRoadmaps } from './files.mts'
import { buildState } from './init.mts'
import type { RoadmapState } from './model.mts'
import { parseRoadmap } from './parse.mts'
import { blocked, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { statePathOf, writeState } from './state.mts'
import { siblingLookup, validateText } from './validate.mts'

export function parseLimit(value: string | undefined): RoadmapState['limit'] | Response {
  if (value === undefined) return undefined
  const match = /^(manual|agent):(\d+(?:\.\d+)?)$/.exec(value)
  return match ? { metric: match[1] as 'manual' | 'agent', maxDays: Number(match[2]) } : blocked('--limit ожидает manual:<дни> или agent:<дни>, например agent:7.')
}

// Сохранение согласованного черновика: проверка → docs/<slug>/<дата>-<slug>-roadmap.md → состояние → таблица «Оценка».
export function createCommand(root: string, draft: string | undefined, slug: string | undefined, options: { limit?: string; date?: string }): Response {
  if (!draft || !slug) return blocked('Использование: roadmap create <черновик.md> <slug> [--limit manual|agent:<дни>] [--date YYYY-MM-DD].')
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return blocked(`slug «${slug}» не подходит: строчные латиница, цифры и дефис.`)
  if (!existsSync(join(root, draft))) return blocked(`Файл черновика ${draft} не найден.`)
  if (findRoadmaps(root).some(item => item.slug === slug) || existsSync(join(root, 'docs', slug))) return blocked(`docs/${slug}/ уже существует.`)
  const limit = parseLimit(options.limit)
  if (limit && 'result' in limit) return limit

  const text = readFileSync(join(root, draft), 'utf8')
  const probe = { state: limit ? buildState(slug, '', parseRoadmap(text), limit) : null, sibling: siblingLookup(root) }
  const problems = validateText(text, probe)
  if (problems.length > 0) return blocked(`Черновик не прошёл проверку: ${problems.length}.`, { problems })

  const date = options.date ?? new Date().toISOString().slice(0, 10)
  const path = `docs/${slug}/${date}-${slug}-roadmap.md`
  const state = buildState(slug, path, parseRoadmap(text), limit)
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), applyTable(text.replace(/\r\n/g, '\n').split('\n'), totals(state.steps)).join('\n'))
  writeState(statePathOf(root, slug), state)
  return ok({ roadmap: slug, path, statePath: `docs/${slug}/roadmap-state.json`, steps: state.steps.length })
}
