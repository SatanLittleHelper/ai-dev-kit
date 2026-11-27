import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { blocked, needsInput } from './responses.mts'
import type { Response } from './responses.mts'
import { statePathOf } from './state.mts'

export interface Located {
  slug: string
  mdPath: string
  statePath: string
}

export function findRoadmaps(root: string): { slug: string; mdPath: string }[] {
  const docs = join(root, 'docs')
  if (!existsSync(docs)) return []
  return readdirSync(docs, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
    const file = readdirSync(join(docs, entry.name)).find(name => name.endsWith('-roadmap.md'))
    return file ? [{ slug: entry.name, mdPath: join(docs, entry.name, file) }] : []
  }).sort((a, b) => a.slug.localeCompare(b.slug))
}

export function selectRoadmap(root: string, slug?: string): Located | Response {
  const all = findRoadmaps(root)
  if (slug) {
    const found = all.find(item => item.slug === slug)
    return found ? { ...found, statePath: statePathOf(root, slug) } : blocked(`Роадмап «${slug}» не найден в docs/.`)
  }
  if (all.length === 0) return blocked('Роадмапов в docs/*/*-roadmap.md нет.')
  if (all.length > 1) return needsInput('Какой роадмап взять?', all.map(item => item.slug))
  return { ...all[0], statePath: statePathOf(root, all[0].slug) }
}

export const isLocated = (value: Located | Response): value is Located => 'mdPath' in value
