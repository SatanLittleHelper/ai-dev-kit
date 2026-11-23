import type { FlowResponse, Stage } from './types.mts'

const EXIT_CODES = { ok: 0, blocked: 1, 'needs-input': 2 } as const

const MARKS = { pending: '[ ]', done: '[x]', skipped: '[-]' } as const

export const exitCode = (response: FlowResponse): number => EXIT_CODES[response.result]

export const renderJson = (response: FlowResponse): string => JSON.stringify(response)

function stageLine(stage: Stage): string {
  const note = stage.status === 'skipped' ? ` — пропущена: ${stage.reason}` : ''
  return `${MARKS[stage.status]} ${stage.name}${note}`
}

export function renderText(response: FlowResponse): string {
  if (response.result === 'blocked') return `Отказ: ${response.reason}`
  if (response.result === 'needs-input') return [response.question, ...response.options.map((option, index) => `${index + 1}. ${option}`)].join('\n')

  const lines = [`Задача ${response.task}`, ...response.stages.map(stageLine)]
  if (response.reset) lines.push(`Сброшены стадии ${response.reset.stages.join(', ')}: файл ${response.reset.file} ${response.reset.reason === 'deleted' ? 'удалён' : 'изменён'}.`)
  lines.push(response.completed ? 'Задача завершена.' : `Текущая стадия: ${response.current}`)

  return lines.join('\n')
}
