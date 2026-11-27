import { lintMarkup, lintTitle } from './lint.mts'
import { parseDraft } from './split.mts'
import type { LintError } from './split.mts'

export interface Ticket {
  id: string
  title: string
  body: string
  titleLine: number
  bodyLine: number
}

export type ParsedTickets = { ok: true; story: Ticket; children: Ticket[] } | { ok: false; errors: LintError[] }

// Документ тикетов роадмапа: разделы «## story» и «## <id чекпоинта>», в каждом два fenced-блока (название, тело).
export function parseTickets(markdown: string): ParsedTickets {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const sections: { id: string; start: number; end: number }[] = []
  for (const [index, line] of lines.entries()) {
    const match = /^##\s+(\S+)\s*$/.exec(line)
    if (match) sections.push({ id: match[1], start: index, end: lines.length })
  }
  for (const [index, section] of sections.entries()) {
    if (index + 1 < sections.length) section.end = sections[index + 1].start
  }

  const errors: LintError[] = []
  const tickets: Ticket[] = []
  const seen = new Set<string>()
  for (const section of sections) {
    if (seen.has(section.id)) errors.push({ rule: 'ticket-duplicate', line: section.start + 1, message: `Раздел «${section.id}» повторён.` })
    seen.add(section.id)
    const offset = section.start + 1
    const parsed = parseDraft(lines.slice(offset, section.end).join('\n'))
    if (!parsed.ok) {
      for (const error of parsed.errors) errors.push({ ...error, line: error.line + offset, message: `[${section.id}] ${error.message}` })
      continue
    }
    tickets.push({ id: section.id, title: parsed.title, body: parsed.body, titleLine: parsed.titleLine + offset, bodyLine: parsed.bodyLine + offset })
  }
  if (!seen.has('story')) errors.push({ rule: 'story-missing', line: 1, message: 'Нет раздела «## story».' })
  if (errors.length > 0) return { ok: false, errors }

  const story = tickets.find(ticket => ticket.id === 'story')!
  return { ok: true, story, children: tickets.filter(ticket => ticket.id !== 'story') }
}

// Название и разметка каждого тикета; при stateIds — id подзадач должны совпасть с шагами roadmap-state.json.
export function lintTickets(parsed: { story: Ticket; children: Ticket[] }, stateIds?: string[]): LintError[] {
  const errors: LintError[] = []
  for (const ticket of [parsed.story, ...parsed.children]) {
    for (const error of [...lintTitle(ticket.title, ticket.titleLine), ...lintMarkup(ticket.body, ticket.bodyLine)]) {
      errors.push({ ...error, message: `[${ticket.id}] ${error.message}` })
    }
  }
  if (stateIds) {
    const present = new Set(parsed.children.map(child => child.id))
    for (const id of stateIds) {
      if (!present.has(id)) errors.push({ rule: 'ticket-missing', line: 1, message: `Нет раздела «## ${id}» для шага роадмапа.` })
    }
    for (const child of parsed.children) {
      if (!stateIds.includes(child.id)) errors.push({ rule: 'ticket-unknown', line: child.titleLine, message: `Раздел «${child.id}» не соответствует ни одному шагу роадмапа.` })
    }
  }
  return errors.sort((a, b) => a.line - b.line)
}
