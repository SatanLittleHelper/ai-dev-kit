import { existsSync, readdirSync } from 'node:fs'
import { basename } from 'node:path'
import { renderText } from './format.mts'
import { currentBranch } from './pr.mts'
import { currentStage, ok } from './responses.mts'
import { isValidId, stateDir } from './store.mts'
import { loadTask } from './task-access.mts'
import type { GuardResponse, ResetNotice, TaskState } from './types.mts'
import type { StageName } from './stages.mts'

export const GUARD_EVENTS = ['session-start', 'stop', 'push', 'pr'] as const

export type GuardEvent = (typeof GUARD_EVENTS)[number]

const GATE_STAGES = ['simplify', 'check', 'local-test', 'review'] as const

const allow = (message?: string): GuardResponse => ({ result: 'guard', decision: 'allow', ...(message ? { message } : {}) })
const deny = (message: string): GuardResponse => ({ result: 'guard', decision: 'deny', message })

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// id задачи входит в имя ветки как отдельный токен без учёта регистра.
export const idMatchesBranch = (id: string, branch: string): boolean => new RegExp(`(?<![a-z0-9])${escape(id.toLowerCase())}(?![a-z0-9])`).test(branch.toLowerCase())

interface OpenTask {
  state: TaskState
  reset?: ResetNotice
}

// Открытая задача ветки. Кандидаты выбираются по именам файлов и читаются независимо: повреждённое состояние чужой задачи
// не отключает защиту. Состояние загружается с инвалидацией, поэтому изменённый после завершения документ возвращает стадии
// в ожидание ещё до проверки «завершена ли задача». При нескольких совпадениях побеждает самый длинный id.
export function openTaskForBranch(root: string, branch: string): OpenTask | undefined {
  const dir = stateDir(root)
  if (!existsSync(dir)) return undefined

  const open: OpenTask[] = []
  for (const name of readdirSync(dir)) {
    const id = basename(name, '.json')
    if (!name.endsWith('.json') || !isValidId(id) || !idMatchesBranch(id, branch)) continue

    const loaded = loadTask({ root, id })
    if ('state' in loaded && currentStage(loaded.state) !== null) open.push(loaded)
  }

  return open.sort((left, right) => right.state.id.length - left.state.id.length)[0]
}

function decide(event: GuardEvent, state: TaskState, current: StageName, stopActive: boolean, reset?: ResetNotice): GuardResponse {
  if (event === 'session-start') return allow(renderText(ok(state, reset)))

  if (event === 'stop') {
    if (stopActive || state.session?.status === 'open') return allow()

    return deny(`Задача ${state.id} не закрыта: текущая стадия ${current}. Продолжите по циклу task-flow (flow status → flow next) либо задайте пользователю вопрос, если нужен его ответ. Следующая остановка в этом ходу будет разрешена.`)
  }

  const pending = GATE_STAGES.filter(name => state.stages.find(stage => stage.name === name)?.status === 'pending')
  if (pending.length === 0) return allow()

  const action = event === 'push' ? 'отправить ветку' : 'создать PR'
  return deny(`Нельзя ${action}: у задачи ${state.id} не закрыты стадии ${pending.join(', ')}. Выполните flow status. Пропуск возможен только через flow skip <стадия> --reason "<причина>".`)
}

// Любой сбой — «разрешено»: хук не должен ломать работу, если flow не смог прочитать состояние.
export function guard({ root, event, branch, stopActive = false }: { root: string; event: GuardEvent; branch?: string; stopActive?: boolean }): GuardResponse {
  try {
    const found = openTaskForBranch(root, branch ?? currentBranch(root))
    if (!found) return allow()

    return decide(event, found.state, currentStage(found.state) as StageName, stopActive, found.reset)
  } catch {
    return allow()
  }
}
