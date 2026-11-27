import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyTable, totals } from './estimate.mts'
import { isLocated, selectRoadmap } from './files.mts'
import { tryGit } from './git.mts'
import { parseRoadmap } from './parse.mts'
import { blocked, needsInput, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { readState, writeState } from './state.mts'

function flowDays(root: string, taskIds: string[], env: NodeJS.ProcessEnv): number | null {
  const cli = fileURLToPath(new URL('../../flow/cli/main.mts', import.meta.url))
  for (const task of taskIds) {
    try {
      const out = execFileSync(process.execPath, [cli, 'time', '--task', task], { cwd: root, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] })
      const json = JSON.parse(out) as { result: string; days: number | null }
      if (json.result === 'time' && json.days !== null) return json.days
    } catch {
      // нет задачи у flow — пробуем следующий id
    }
  }
  return null
}

export function closeCommand(root: string, id: string | undefined, options: { slug?: string; days?: string }, env: NodeJS.ProcessEnv): Response {
  if (!id) return blocked('Использование: roadmap close <id> [--slug …] [--days N].')
  const located = selectRoadmap(root, options.slug)
  if (!isLocated(located)) return located
  const state = readState(located.statePath)
  const step = state?.steps.find(candidate => candidate.id === id)
  if (!state || !step) return blocked(`Шага «${id}» нет в roadmap-state.json роадмапа «${located.slug}».`)
  if (step.status === 'closed') return blocked(`Шаг «${id}» уже закрыт.`)

  let actualDays: number | null = null
  if (step.estimate) {
    if (options.days !== undefined) {
      actualDays = Number(options.days)
      if (!Number.isFinite(actualDays) || actualDays < 0) return blocked('--days — неотрицательное число.')
    } else {
      actualDays = flowDays(root, [...(step.ticket !== 'TBD' ? [step.ticket] : []), id], env)
      if (actualDays === null) return needsInput(`Сколько рабочих дней ушло на шаг «${id}»? Данных flow нет; повторите команду с --days <N>.`)
    }
  }

  const text = readFileSync(located.mdPath, 'utf8').replace(/\r\n/g, '\n')
  const roadmap = parseRoadmap(text)
  const checkpoint = roadmap.checkpoints.find(candidate => candidate.id === id)
  if (!checkpoint) return blocked(`Шага «${id}» нет в роадмапе.`)
  const lines = text.split('\n')
  lines[checkpoint.line - 1] = lines[checkpoint.line - 1].replace('- [ ]', '- [x]')

  const deleted: string[] = []
  for (const file of [step.planPath, step.testPlanPath]) {
    if (file && existsSync(join(root, file))) {
      rmSync(join(root, file))
      deleted.push(file)
    }
  }
  const folder = step.stepFolder ? join(root, step.stepFolder) : null
  if (folder && existsSync(folder) && readdirSync(folder).length === 0) rmdirSync(folder)

  step.status = 'closed'
  step.planPath = null
  step.testPlanPath = null
  if (step.estimate) step.estimate.actualDays = actualDays
  const result = totals(state.steps)
  const remaining = roadmap.checkpoints.some(candidate => !candidate.checked && candidate.id !== id)

  let roadmapDeleted = false
  if (remaining) {
    writeFileSync(located.mdPath, applyTable(lines, result).join('\n'))
    writeState(located.statePath, state)
  } else {
    rmSync(dirname(located.mdPath), { recursive: true, force: true })
    roadmapDeleted = true
  }

  const marker = join(root, 'tmp', 'roadmap', 'isolated.json')
  if (existsSync(marker)) {
    tryGit(root, 'sparse-checkout', 'disable')
    rmSync(marker)
  }
  return ok({ checked: id, deleted, roadmapDeleted, actualDays, remaining: result.remaining })
}
