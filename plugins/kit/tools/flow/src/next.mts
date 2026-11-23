import { instructionsFor } from './instructions.mts'
import { advanceJiraStage, runJiraTransition } from './jira-transition.mts'
import type { JiraTransition } from './jira-transition.mts'
import { draftPath, targetPath } from './paths.mts'
import { blocked, currentStage } from './responses.mts'
import { loadRules } from './rules.mts'
import { detectStacks } from './stack.mts'
import { IMPLEMENT_METHODS, isAgentStage } from './stages.mts'
import type { AgentStageName } from './stages.mts'
import { agentPackage, isImplementMethod, methodQuestion } from './stage-work.mts'
import { writeState } from './store.mts'
import { resolve } from 'node:path'
import { loadTask, withTaskLock } from './task-access.mts'
import type { FlowResponse, ResetNotice, TaskState, TestPlanMode } from './types.mts'

export function testPlanMode(state: TaskState): TestPlanMode {
  const stage = state.stages.find(candidate => candidate.name === 'test-plan')
  if (stage?.status === 'done' && stage.evidence) return { mode: 'separate', path: stage.evidence }
  if (stage?.status === 'skipped' && stage.reason?.startsWith('combined')) return { mode: 'combined' }

  return { mode: 'none' }
}

export function nextPackage({
  root, id, now, jiraTransition = runJiraTransition, confirmJira = false, noDryRun = false, method, agent,
}: {
  root: string
  method?: string
  agent?: string
  id?: string
  now: Date
  jiraTransition?: JiraTransition
  confirmJira?: boolean
  noDryRun?: boolean
}): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response

  const { state, reset } = loaded
  const stage = currentStage(state)
  if (method !== undefined && stage !== 'implement') return blocked('Флаг --method действует только на стадии implement.')
  if (stage === 'in-progress') {
    return advanceJiraStage({ root, key: state.id, run: jiraTransition, confirm: confirmJira, noDryRun, priorReset: reset })
  }
  if (confirmJira || noDryRun) return blocked('Флаги --confirm-jira и --no-dry-run действуют только на стадии in-progress.')
  if (stage === null) return blocked(`Задача ${state.id} завершена: рабочих пакетов больше нет.`)
if (stage === 'implement' && method !== undefined) {
    if (!isImplementMethod(method)) return blocked(`Неизвестный метод «${method}». Допустимые: ${IMPLEMENT_METHODS.join(', ')}.`)
    return withTaskLock(root, state.id, () => {
      const fresh = loadTask({ root, id: state.id })
      if (!('state' in fresh)) return fresh.response
      if (currentStage(fresh.state) !== 'implement') return blocked('Стадия implement уже не текущая: состояние задачи изменилось. Повторите flow status.')
      fresh.state.method = method
      writeState(root, fresh.state)
      return agentResponse(root, fresh.state, 'implement', agent, fresh.reset)
    })
  }
  if (stage === 'implement' && !state.method) return methodQuestion()
  if (isAgentStage(stage) || stage === 'review' || stage === 'pr') return agentResponse(root, state, stage, agent, reset)

  const stacks = detectStacks(root)
  const loadedRules = loadRules(root, stage, stacks)
  if ('reason' in loadedRules) return blocked(loadedRules.reason)

  const testPlan = stage === 'plan' ? testPlanMode(state) : undefined

  return {
    result: 'ok',
    task: state.id,
    stage,
    package: {
      stage,
      draftPath: draftPath(root, state, stage),
      targetPath: targetPath(state, stage, now),
      language: 'ru',
      stacks,
      ...(testPlan ? { testPlan } : {}),
      rulesDir: loadedRules.dir,
      rules: loadedRules.rules,
      instructions: instructionsFor(stage, stacks, testPlan),
    },
    ...(reset ? { reset } : {}),
  }
}

// Путь плана в состоянии хранится от корня репозитория; агенту отдаётся абсолютный, чтобы он не зависел от текущей папки.
const planEvidence = (root: string, state: TaskState): string | undefined => {
  const plan = state.stages.find(candidate => candidate.name === 'plan')
  return plan?.status === 'done' && plan.evidence ? resolve(root, plan.evidence) : undefined
}

function agentResponse(root: string, state: TaskState, stage: AgentStageName | 'review' | 'pr', agent: string | undefined, reset: ResetNotice | undefined): FlowResponse {
  return { result: 'ok', task: state.id, stage, agentPackage: agentPackage(state.id, stage, { method: state.method, agent, planPath: planEvidence(root, state) }), ...(reset ? { reset } : {}) }
}
