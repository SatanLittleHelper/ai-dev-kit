import type { AgentPackageResponse, FlowResponse, PackageResponse, Stage } from './types.mts'

const EXIT_CODES = { ok: 0, pending: 0, approved: 0, blocked: 1, dismissed: 1, 'needs-input': 2, annotated: 2, 'review-feedback': 2 } as const

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

if (response.result === 'pending') return response.stage === 'review' ? 'Ревью кода ждёт решения в Plannotator.' : `Документ стадии ${response.stage} ждёт решения в Plannotator: ${response.draft}.`
  if (response.result === 'approved') return `Согласовано: ${response.target}.${response.feedback ? `\n${response.feedback}` : ''}`
  if (response.result === 'annotated') return `Замечания${response.annotationCount === undefined ? '' : ` (${response.annotationCount})`}: ${response.feedback}`
  if (response.result === 'dismissed') return 'Согласование отклонено.'
  if (response.result === 'review-feedback') return `Ревью, итерация ${response.iter} из ${response.max}: ${response.verdict}, отчёт ${response.reportPath}. ${response.instruction}`

  if ('agentPackage' in response) return renderAgentPackage(response)
  if ('package' in response) return renderPackage(response)
  if ('valid' in response) return `Документ стадии ${response.stage} прошёл проверку.${response.taskCount === undefined ? '' : ` Задач в плане: ${response.taskCount}.`}`

  const lines = [`Задача ${response.task}`, ...response.stages.map(stageLine)]
  if (response.reset) lines.push(`Сброшены стадии ${response.reset.stages.join(', ')}: файл ${response.reset.file} ${response.reset.reason === 'deleted' ? 'удалён' : 'изменён'}.`)
  lines.push(response.completed ? 'Задача завершена.' : `Текущая стадия: ${response.current}`)

  return lines.join('\n')
}

function renderPackage(response: PackageResponse): string {
  const pack = response.package
  const lines = [
    `Задача ${response.task}`,
    `Стадия: ${pack.stage}`,
    `Черновик: ${pack.draftPath}`,
    `Цель: ${pack.targetPath}`,
    `Папка правил: ${pack.rulesDir}`,
    ...(pack.stacks.length ? [`Стеки: ${pack.stacks.join(', ')}`] : []),
    '',
    ...pack.instructions.map(line => `- ${line}`),
  ]
  for (const rule of pack.rules) lines.push('', `--- ${rule.name} ---`, rule.text)

  return lines.join('\n')
}

function renderAgentPackage(response: AgentPackageResponse): string {
  const pack = response.agentPackage
  return [
    `Задача ${response.task}`,
    `Стадия: ${pack.stage}`,
    ...(pack.method ? [`Метод: ${pack.method}`] : []),
    ...(pack.evidencePath ? [`Файл доказательства: ${pack.evidencePath}`] : []),
    '',
    ...pack.instructions.map(line => `- ${line}`),
  ].join('\n')
}
