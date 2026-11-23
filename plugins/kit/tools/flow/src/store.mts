import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { TaskState } from './types.mts'

export class CorruptedState extends Error {
  path: string

  constructor(path: string) {
    super(`Состояние повреждено: ${path}`)
    this.name = 'CorruptedState'
    this.path = path
  }
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const isValidId = (id: string): boolean => ID_PATTERN.test(id)

export const stateDir = (root: string): string => join(root, 'tmp', 'flow')

export const statePath = (root: string, id: string): string => join(stateDir(root), `${id}.json`)

function parse(path: string): TaskState {
  let json: unknown
  try {
    json = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new CorruptedState(path)
  }

  const candidate = json as Partial<TaskState> | null
  if (!candidate || typeof candidate.id !== 'string' || !isValidId(candidate.id) || candidate.id !== basename(path, '.json') || !Array.isArray(candidate.stages)) throw new CorruptedState(path)

  return candidate as TaskState
}

export function readState(root: string, id: string): TaskState | null {
  if (!isValidId(id)) return null

  const path = statePath(root, id)
  return existsSync(path) ? parse(path) : null
}

export function writeState(root: string, state: TaskState): void {
  mkdirSync(stateDir(root), { recursive: true })
  writeFileSync(statePath(root, state.id), `${JSON.stringify(state, null, 2)}\n`)
}

export function listStates(root: string): TaskState[] {
  const dir = stateDir(root)
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => parse(join(dir, name)))
}
