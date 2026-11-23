import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeStage, startTask } from '../src/flow.mts'
import { DOCUMENT_STAGES, STAGE_NAMES } from '../src/stages.mts'
import type { StageName } from '../src/stages.mts'
import type { BlockedResponse, FlowResponse, NeedsInputResponse, OkResponse, PackageResponse, Stage, TaskState } from '../src/types.mts'

export const tempRoot = (): string => realpathSync(mkdtempSync(join(tmpdir(), 'flow-')))

export const docPath = (root: string, name: string): string => join(root, 'docs', `${name}.md`)

export function writeDoc(root: string, name: string, content = 'черновик'): string {
  mkdirSync(join(root, 'docs'), { recursive: true })
  const path = docPath(root, name)
  writeFileSync(path, content)
  return path
}

const statePath = (root: string, id: string): string => join(root, 'tmp', 'flow', `${id}.json`)

export const readStateFile = (root: string, id: string): TaskState => JSON.parse(readFileSync(statePath(root, id), 'utf8'))

export const stageOf = (state: TaskState, name: StageName): Stage | undefined => state.stages.find(stage => stage.name === name)

// Готовое состояние: стадии из overrides подменяют ожидающие.
export function seed(root: string, id: string, overrides: Stage[] = []): TaskState {
  const stages = STAGE_NAMES.map((name): Stage => overrides.find(stage => stage.name === name) ?? { name, status: 'pending' })
  const state: TaskState = { id, stages }
  mkdirSync(join(root, 'tmp', 'flow'), { recursive: true })
  writeFileSync(statePath(root, id), JSON.stringify(state))
  return state
}

export function begin(root: string, id = 'A1'): void {
  expectOk(startTask({ root, id, noTracker: true }))
}

export function expectOk(response: FlowResponse): OkResponse {
  if (response.result !== 'ok') assert.fail(`ожидался ok, получен ${JSON.stringify(response)}`)
  return response as OkResponse
}

export function expectPackage(response: FlowResponse): PackageResponse {
  if (response.result !== 'ok' || !('package' in response)) assert.fail(`ожидался пакет, получен ${JSON.stringify(response)}`)
  return response as PackageResponse
}

export function expectBlocked(response: FlowResponse): BlockedResponse {
  if (response.result !== 'blocked') assert.fail(`ожидался blocked, получен ${JSON.stringify(response)}`)
  return response
}

export function expectNeedsInput(response: FlowResponse): NeedsInputResponse {
  if (response.result !== 'needs-input') assert.fail(`ожидался needs-input, получен ${JSON.stringify(response)}`)
  return response
}

// Закрывает по порядку все ожидающие стадии до last включительно; документные получают реальные файлы.
export function closeThrough(root: string, id: string, last: StageName): void {
  for (const stage of readStateFile(root, id).stages) {
    if (stage.status !== 'pending') continue

    const evidence = DOCUMENT_STAGES.has(stage.name) ? writeDoc(root, stage.name) : `доказательство ${stage.name}`
    expectOk(closeStage({ root, id, stage: stage.name, evidence }))
    if (stage.name === last) return
  }
}

// Создаёт минимальные метаданные временного репозитория без изменяющих Git-команд.
export function initTestRepository(root: string): void {
  const gitDir = join(root, '.git')
  mkdirSync(join(gitDir, 'objects'), { recursive: true })
  mkdirSync(join(gitDir, 'refs', 'heads'), { recursive: true })
  writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
}
