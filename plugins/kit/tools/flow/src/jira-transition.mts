import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { blocked, currentStage, ok } from './responses.mts'
import { writeState } from './store.mts'
import { loadTask, withTaskLock } from './task-access.mts'
import { checkJiraInstance, isIssueKey } from './ticket.mts'
import type { BlockedResponse, FlowResponse, ResetNotice, TaskState } from './types.mts'

interface JiraOutput {
  code: number | null
  stdout: string
  stderr: string
}

export type JiraTransition = (root: string, key: string, noDryRun: boolean, instance?: string) => JiraOutput

const CLI = fileURLToPath(new URL('../../jira/cli/main.mts', import.meta.url))

export const runJiraTransition: JiraTransition = (root, key, noDryRun, instance) => {
  const args = [CLI, 'transition', key]
  if (noDryRun) args.push('--no-dry-run')
  const run = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      JIRA_HEADLESS: process.env.JIRA_HEADLESS ?? '1',
      JIRA_EXPECTED_INSTANCE: instance,
    },
    timeout: 180_000,
  })
  return {
    code: run.status,
    stdout: run.stdout ?? '',
    stderr: run.error?.message ?? run.stderr ?? '',
  }
}

function verifiedIssueUrl(reply: JiraOutput, key: string, instance?: string): string | BlockedResponse {
  if (reply.code !== 0) return blocked(reply.stderr.trim() || `Не удалось выполнить переход в Jira для ${key}.`)

  let value: unknown
  try {
    value = JSON.parse(reply.stdout)
  } catch {
    return blocked(`Jira CLI вернул некорректный JSON для ${key}.`)
  }
  const result = value as { key?: unknown; status?: unknown; issueStatus?: unknown; url?: unknown } | null
  if (result?.key !== key) return blocked(`Ответ Jira CLI не подтверждает задачу ${key}.`)
  if (result.status === 'dry-run') {
    return blocked(`Переход ${key} проверен в пробном режиме. Для фактического перехода выполните flow next --task ${key} --no-dry-run.`)
  }
  if ((result.status !== 'transitioned' && result.status !== 'already-in-progress') ||
      typeof result.issueStatus !== 'string' || !result.issueStatus.trim()) {
    return blocked(`Ответ Jira CLI не подтверждает статус задачи ${key}.`)
  }
  const url = typeof result.url === 'string' ? URL.parse(result.url) : null
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !url.pathname.replace(/\/$/, '').endsWith(`/browse/${key}`)) {
    return blocked(`Ответ Jira CLI содержит некорректный URL карточки ${key}.`)
  }
  if (instance && `${url.origin}${url.pathname.replace(/\/$/, '')}` !== `${instance}/browse/${key}`) {
    return blocked(`Ответ Jira CLI содержит URL другого экземпляра для ${key}.`)
  }
  return url.href
}

function save(root: string, state: TaskState): BlockedResponse | undefined {
  try {
    writeState(root, state)
  } catch (error) {
    return blocked(`Не удалось сохранить состояние задачи ${state.id}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function advanceJiraStage({
  root, key, run, confirm, noDryRun, priorReset,
}: {
  root: string
  key: string
  run: JiraTransition
  confirm: boolean
  noDryRun: boolean
  priorReset?: ResetNotice
}): FlowResponse {
  return withTaskLock(root, key, () => {
    const loaded = loadTask({ root, id: key })
    if (!('state' in loaded)) return loaded.response
    const { state, reset } = loaded
    if (currentStage(state) !== 'in-progress') return blocked(`Стадия in-progress задачи ${key} уже пройдена. Повторите flow next.`)
    if (!isIssueKey(key)) return blocked(`У задачи ${key} нет ключа Jira. Используйте flow skip in-progress --task ${key} --reason <причина>.`)
    if (state.tracker !== 'jira') {
      if (!confirm) return blocked(`У задачи ${key} не подтверждена привязка к Jira. Выполните flow next --task ${key} --confirm-jira или пропустите стадию через flow skip in-progress с причиной.`)
      state.tracker = 'jira'
      const persisted = save(root, state)
      if (persisted) return persisted
    }

    if (state.jiraInstance) {
      const problem = checkJiraInstance(root, state.jiraInstance)
      if (problem) return problem
    }
    const url = verifiedIssueUrl(run(root, key, noDryRun, state.jiraInstance), key, state.jiraInstance)
    if (typeof url !== 'string') return url

    const stage = state.stages.find(stage => stage.name === 'in-progress')!
    stage.status = 'done'
    stage.evidence = url
    return save(root, state) ?? ok(state, reset ?? priorReset)
  })
}
