import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isLocated, selectRoadmap } from './files.mts'
import type { Roadmap } from './model.mts'
import { parseRoadmap } from './parse.mts'
import { ok } from './responses.mts'
import type { Response } from './responses.mts'
import { toWiki } from './wiki.mts'

const fence = (text: string): string => `\`\`\`\n${text}\n\`\`\``

export function buildTickets(roadmap: Roadmap): string {
  const sections = [`# Стори: ${roadmap.title}`, '', 'Документ тикетов для согласования: после approved его создаёт `jira create-roadmap`. Этот текст в Jira не уходит.', '']
  sections.push('## story', fence(roadmap.title), fence(`h3. Контекст\n${toWiki(roadmap.context)}`.trimEnd()), '')
  for (const checkpoint of roadmap.checkpoints.filter(candidate => !candidate.checked)) {
    const parts: string[] = []
    if (checkpoint.scope) parts.push(`h3. Объём\n${toWiki(checkpoint.scope)}`)
    if (checkpoint.done) parts.push(`h3. Готово, когда\n${toWiki(checkpoint.done)}`)
    sections.push(`## ${checkpoint.id}`, fence(checkpoint.title), fence(parts.length > 0 ? parts.join('\n\n') : checkpoint.title), '')
  }
  return `${sections.join('\n').trimEnd()}\n`
}

export function ticketsCommand(root: string, slug: string | undefined): Response {
  const located = selectRoadmap(root, slug)
  if (!isLocated(located)) return located
  const path = `tmp/drafts/${located.slug}-tickets.md`
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), buildTickets(parseRoadmap(readFileSync(located.mdPath, 'utf8'))))
  return ok({ roadmap: located.slug, path })
}
