import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { STAGE_NAMES } from './stages.mts'
import type { TaskState } from './types.mts'

export class CorruptedState extends Error {
  path: string

  constructor(path: string, detail?: string) {
    super(`Состояние повреждено: ${path}${detail ? ` (${detail})` : ''}`)
    this.name = 'CorruptedState'
    this.path = path
  }
}

const STATUSES = ['pending', 'done', 'skipped']

function stagesProblem(stages: unknown[]): string | null {
  if (stages.length !== STAGE_NAMES.length) return `ожидалось ${STAGE_NAMES.length} стадий, найдено ${stages.length}`

  for (const [index, name] of STAGE_NAMES.entries()) {
    const stage = stages[index] as { name?: unknown; status?: unknown } | null
    if (!stage || stage.name !== name) return `на позиции ${index + 1} ожидалась стадия ${name}`
    if (typeof stage.status !== 'string' || !STATUSES.includes(stage.status)) return `недопустимый статус стадии ${name}`
  }

  return null
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

  const problem = stagesProblem(candidate.stages)
  if (problem) throw new CorruptedState(path, problem)

  return candidate as TaskState
}

export function readState(root: string, id: string): TaskState | null {
  if (!isValidId(id)) return null

  const path = statePath(root, id)
  return existsSync(path) ? parse(path) : null
}

export function writeState(root: string, state: TaskState): void {
  mkdirSync(stateDir(root), { recursive: true })
  const path = statePath(root, state.id)
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' })
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

export function listStates(root: string): TaskState[] {
  const dir = stateDir(root)
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => parse(join(dir, name)))
}
