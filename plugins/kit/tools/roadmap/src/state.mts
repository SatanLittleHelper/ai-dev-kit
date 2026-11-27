import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RoadmapState } from './model.mts'

export const statePathOf = (root: string, slug: string): string => join(root, 'docs', slug, 'roadmap-state.json')

export function readState(path: string): RoadmapState | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as RoadmapState
}

// Атомарная запись: временный файл + rename; остальные поля файла сохраняются как есть.
export function writeState(path: string, state: RoadmapState): void {
  state.updatedAt = new Date().toISOString()
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(temporary, path)
}
