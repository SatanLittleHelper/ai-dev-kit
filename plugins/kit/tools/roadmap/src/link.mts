import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isLocated, selectRoadmap } from './files.mts'
import { parseRoadmap } from './parse.mts'
import { blocked, needsInput, ok } from './responses.mts'
import type { Response } from './responses.mts'
import { readState, writeState } from './state.mts'

interface Link { key: string; url: string }

export function linkCommand(root: string, slug: string | undefined, from: string | undefined): Response {
  if (!from) return blocked('Использование: roadmap link <slug> --from <файл created.json>.')
  if (!existsSync(join(root, from))) return blocked(`Файл ${from} не найден.`)
  const located = selectRoadmap(root, slug)
  if (!isLocated(located)) return located
  const state = readState(located.statePath)
  if (!state) return blocked(`Нет ${located.statePath}: сначала roadmap init ${located.slug}.`)
  const created = JSON.parse(readFileSync(join(root, from), 'utf8')) as { story: Link | null; children: Record<string, Link> }

  for (const [id, link] of Object.entries(created.children)) {
    const step = state.steps.find(candidate => candidate.id === id)
    if (step && step.ticket && step.ticket !== 'TBD' && step.ticket !== link.key) {
      return needsInput(`У шага «${id}» уже ключ ${step.ticket}, а в результате — ${link.key}. Какой оставить? Перезапишите вручную и повторите link.`, [step.ticket, link.key])
    }
  }

  const text = readFileSync(located.mdPath, 'utf8').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const roadmap = parseRoadmap(text)
  const linked: string[] = []
  const skipped: string[] = []
  for (const [id, link] of Object.entries(created.children)) {
    const step = state.steps.find(candidate => candidate.id === id)
    const checkpoint = roadmap.checkpoints.find(candidate => candidate.id === id)
    if (!step || !checkpoint) {
      skipped.push(id)
      continue
    }
    if (step.ticket === link.key) {
      skipped.push(id)
      continue
    }
    step.ticket = link.key
    const line = lines[checkpoint.line - 1]
    if (/\(Jira:[^)]*\)/.test(line)) lines[checkpoint.line - 1] = line.replace(/\(Jira:[^)]*\)/, `(Jira: ${link.key})`)
    else if (/\((est|depends):/.test(line)) lines[checkpoint.line - 1] = line.replace(/\s*\((est|depends):/, ` (Jira: ${link.key}) ($1:`)
    else lines[checkpoint.line - 1] = `${line} (Jira: ${link.key})`
    linked.push(id)
  }
  if (created.story) {
    state.story = created.story
    const title = lines.findIndex(line => /^# /.test(line))
    if (title >= 0) {
      if (/^Jira: /.test(lines[title + 1] ?? '')) lines[title + 1] = `Jira: ${created.story.key}`
      else lines.splice(title + 1, 0, `Jira: ${created.story.key}`)
    }
  }
  writeFileSync(located.mdPath, lines.join('\n'))
  writeState(located.statePath, state)
  return ok({ roadmap: located.slug, linked, skipped, story: created.story })
}
