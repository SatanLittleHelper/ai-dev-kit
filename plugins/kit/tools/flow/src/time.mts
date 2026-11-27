import { blocked } from './responses.mts'
import { loadTask } from './task-access.mts'
import type { FlowResponse, TaskState } from './types.mts'

type Timeline = NonNullable<TaskState['timeline']>

export function computeTime(timeline: Timeline, idleHours: number): { days: number | null; hours: number; active: number; skipped: number } {
  const times = timeline.map(entry => Date.parse(entry.at)).filter(value => Number.isFinite(value)).sort((a, b) => a - b)
  if (times.length < 2) return { days: null, hours: 0, active: 0, skipped: 0 }
  let ms = 0
  let active = 0
  let skipped = 0
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1]
    if (gap > idleHours * 3_600_000) skipped += 1
    else {
      ms += gap
      active += 1
    }
  }
  const hours = ms / 3_600_000
  return { days: Math.round((hours / 6) * 10) / 10, hours: Math.round(hours * 100) / 100, active, skipped }
}

export function timeCommand({ root, id, idleHours }: { root: string; id?: string; idleHours?: number }): FlowResponse {
  const loaded = loadTask({ root, id })
  if (!('state' in loaded)) return loaded.response
  const threshold = idleHours ?? Number(process.env.FLOW_IDLE_HOURS ?? 3)
  if (!Number.isFinite(threshold) || threshold <= 0) return blocked('--idle-hours — положительное число часов.')
  const result = computeTime(loaded.state.timeline ?? [], threshold)
  return { result: 'time', task: loaded.state.id, ...result, idleHours: threshold } as never
}
