import type { ListRow, Status } from './status.mts'

export interface DashboardResult {
  due: ListRow[]
  waiting: ListRow[]
  truncated: boolean
}

const STATUS_ICONS: Record<Status, string> = {
  'упал CI': '🔴',
  'есть замечания': '💬',
  'конфликт': '⚠️',
  'на проверке': '👀',
  'перепроверка': '🔁',
  'готов к слиянию': '✅',
  'закройте диалоги': '💬',
  'ждём автора': '⏳',
  'ждём ревью': '⏳',
  'влит': '🟣',
  'закрыт': '⚫',
}

const CI_ICONS: Record<ListRow['ci'], string> = { success: '✅', failure: '❌', pending: '⏳', none: '—' }

const HEADER = '| PR | Статус | CI | Одобрения | Ветка | Автор | Заголовок | Активность |\n|---|---|---|---|---|---|---|---|'
const TRUNCATED_NOTE = 'Прочитано 50 открытых PR — это предел одного запроса; остальные смотрите по номеру'

// Ячейки таблицы не должны ломаться от `|` и переводов строки в заголовках.
const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim()

function statusCell(row: ListRow): string {
  return `${STATUS_ICONS[row.status]} ${row.status}${row.isOwn ? ' (мой)' : ''}${row.conflicted ? ' · конфликт' : ''}${row.stackParent !== null ? ` · после #${row.stackParent}` : ''}`
}

function rowLine(row: ListRow): string {
  const cells = [
    `[#${row.number}](${row.url})`,
    statusCell(row),
    CI_ICONS[row.ci],
    row.approvals > 0 ? `${row.approvals} ✅` : '—',
    `\`${row.headRef}\` → \`${row.baseRef}\``,
    row.isOwn ? 'вы' : row.author,
    row.title,
    row.activity || '—',
  ]
  return `| ${cells.map(cell).join(' | ')} |`
}

function failedLine(rows: readonly ListRow[]): string | null {
  const failed = rows.filter(row => row.ci === 'failure' && row.failedChecks.length > 0)
  if (failed.length === 0) return null
  return `Упавшие проверки: ${failed.map(row => `#${row.number} — ${row.failedChecks.join(', ')}`).join('; ')}`
}

function group(title: string, rows: readonly ListRow[]): string {
  const lines = [`${title} (${rows.length})`, '', HEADER, ...rows.map(rowLine)]
  const failed = failedLine(rows)
  if (failed) lines.push('', failed)
  return lines.join('\n')
}

// Дашборд — детерминированный markdown: порядок строк и формат полностью задаёт CLI, агент только показывает вывод.
export function renderDashboard(result: DashboardResult): string {
  const blocks: string[] = []
  if (result.due.length > 0) blocks.push(group('Требует вашего действия', result.due))
  if (result.waiting.length > 0) blocks.push(group('Ждёт других', result.waiting))
  if (blocks.length === 0) blocks.push('Открытых PR нет.')
  if (result.truncated) blocks.push(TRUNCATED_NOTE)
  return blocks.join('\n\n')
}
