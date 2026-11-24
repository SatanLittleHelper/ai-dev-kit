// Решение, что делать с задачей Jira после мерджа PR: чистые функции, без обращения к Jira и файлам.
import { issueKeysIn } from './issue-key.mts'

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

interface ProjectJson {
  ticketPrefix?: unknown
  jira?: { baseUrl?: unknown; testerEmail?: unknown }
}

export type Plan =
  | { result: 'skipped'; reason: 'no-jira' | 'no-key' }
  | { result: 'needs-tester-email'; key: string }
  | { result: 'ready'; key: string; assignee?: string }

export interface AfterMergeInput {
  headRef: string
  title: string
  testerEmail?: string
  noAssignee: boolean
}

export function findIssueKey(texts: readonly string[], ticketPrefix?: string): string | undefined {
  const prefix = ticketPrefix?.trim().toUpperCase()
  for (const value of texts) {
    for (const key of issueKeysIn(value)) {
      if (!prefix || key.startsWith(`${prefix}-`)) return key
    }
  }
}

export function planAfterMerge(json: ProjectJson, input: AfterMergeInput): Plan {
  if (!text(json.jira?.baseUrl)) return { result: 'skipped', reason: 'no-jira' }
  const key = findIssueKey([input.headRef, input.title], text(json.ticketPrefix))
  if (!key) return { result: 'skipped', reason: 'no-key' }
  if (input.noAssignee) return { result: 'ready', key }
  const assignee = input.testerEmail ?? text(json.jira?.testerEmail)
  return assignee ? { result: 'ready', key, assignee } : { result: 'needs-tester-email', key }
}

export function withTesterEmail(raw: string, email: string): string {
  const json = JSON.parse(raw)
  json.jira = { ...json.jira, testerEmail: email }
  return `${JSON.stringify(json, null, 2)}\n`
}
