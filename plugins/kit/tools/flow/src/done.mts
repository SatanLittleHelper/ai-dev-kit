import { lookupPr, parsePrUrl, canonicalPrUrl, currentBranch } from './pr.mts'
import type { PrLookup } from './pr.mts'
import { runJiraTransition, transitionToReview } from './jira-transition.mts'
import type { JiraTransition } from './jira-transition.mts'
import type { TaskState } from './types.mts'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { repoRelative } from './evidence.mts'
import { closeStage, selectStage } from './flow.mts'
import { syncBlock } from './drift.mts'
import { blocked } from './responses.mts'
import { STAGE_NAMES, isAgentStage } from './stages.mts'
import { loadTask, withTaskLock } from './task-access.mts'
import type { FlowResponse } from './types.mts'

export interface DoneOptions {
  root: string
  cwd: string
  id?: string
  stage: string
  evidence?: string
  prLookup?: PrLookup
  jiraTransition?: JiraTransition
  noDryRun?: boolean
}

export function doneStage(options: DoneOptions): FlowResponse {
  const loaded = loadTask({ root: options.root, id: options.id })
  if (!('state' in loaded)) return loaded.response

  const task = loaded.state.id
  return withTaskLock(options.root, task, () => done({ ...options, id: task }))
}

function done({ root, cwd, id, stage, evidence, prLookup, jiraTransition, noDryRun }: DoneOptions & { id: string }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state } = loaded
  const unsynced = syncBlock(state)
  if (unsynced) return unsynced
  if (!(STAGE_NAMES as readonly string[]).includes(stage)) return blocked(`Неизвестная стадия «${stage}». Допустимые: ${STAGE_NAMES.join(', ')}.`)
  if (stage === 'pr') return donePr({ root, id, state, evidence, prLookup: prLookup ?? lookupPr, jiraTransition: jiraTransition ?? runJiraTransition, noDryRun: noDryRun ?? false })
  if (!isAgentStage(stage as never)) return blocked(`Стадия ${stage} закрывается не командой done: документы и ревью кода — через flow submit и flow wait, остальное — через flow next.`)
  if (stage === 'implement' && !state.method) return blocked('Сначала выберите метод реализации: flow next --method <метод>.')

  const proof = evidence?.trim()
  if (!proof) return blocked(`Для закрытия стадии ${stage} нужно доказательство.`)

  const rel = repoRelative(root, cwd, proof)
  if (rel === null) return blocked(`Путь доказательства вне репозитория: ${proof}.`)

  const file = resolve(root, rel)
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return blocked(`Файл доказательства не найден: ${proof}.`)
  if (readFileSync(file, 'utf8').trim() === '') return blocked(`Файл доказательства пуст: ${proof}.`)

  return closeStage({ root, id, stage, evidence: proof, cwd })
}

function donePr({ root, id, state, evidence, prLookup, jiraTransition, noDryRun }: { root: string; id: string; state: TaskState; evidence?: string; prLookup: PrLookup; jiraTransition: JiraTransition; noDryRun: boolean }): FlowResponse {
  const proof = evidence?.trim()
  if (!proof) return blocked('Для закрытия стадии pr нужен URL pull request.')

  const number = parsePrUrl(proof)
  if (number === null) return blocked('Для стадии pr ожидается URL pull request вида https://<хост>/<владелец>/<репозиторий>/pulls/<номер>.')

  const target = selectStage(state, 'pr')
  if ('result' in target) return target

  const found = prLookup(root, number)
  if ('error' in found) return blocked(`PR ${proof} не подтверждён: ${found.error}`)
  if (found.state !== 'open' || found.merged) return blocked(`PR ${proof} не открыт.`)
  if (canonicalPrUrl(found.url) !== canonicalPrUrl(proof)) return blocked(`Адрес PR в репозитории («${found.url}») не совпадает с переданным ${proof}.`)
  if (found.fromFork) return blocked(`PR ${proof} создан из форка: нужен PR из ветки этого репозитория.`)
  const branch = currentBranch(root)
  if (found.headRef !== branch) return blocked(`PR ${proof} создан из другой ветки («${found.headRef}»), а текущая ветка — «${branch}».`)

  const failure = transitionToReview({ root, state, run: jiraTransition, noDryRun })
  if (failure) return failure

  return closeStage({ root, id, stage: 'pr', evidence: proof })
}
