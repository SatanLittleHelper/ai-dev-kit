import { join } from 'node:path'
import { CliError, EXIT } from './errors.mts'

export interface JiraConfig {
  baseUrl: string
  host: string
  ticketPrefix?: string
  defaultIssueType?: string
}

const CONFIG_FILE = join('.claude', 'dev-conventions.json')

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

export function loadConfig(cwd: string, readFile: (path: string) => string): JiraConfig {
  const path = join(cwd, CONFIG_FILE)
  let raw: string
  try {
    raw = readFile(path)
  } catch {
    throw new CliError(`Не найден ${path}: запустите команду из корня проекта.`, EXIT.FAILURE)
  }
  let json: { ticketPrefix?: unknown; jira?: { baseUrl?: unknown; defaultIssueType?: unknown } }
  try {
    json = JSON.parse(raw)
  } catch {
    throw new CliError(`${path} — невалидный JSON.`, EXIT.FAILURE)
  }
  const baseUrl = text(json?.jira?.baseUrl)
  if (!baseUrl) throw new CliError('Не задан jira.baseUrl в .claude/dev-conventions.json.', EXIT.FAILURE)
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new CliError(`jira.baseUrl «${baseUrl}» не похож на URL.`, EXIT.FAILURE)
  }
  return {
    baseUrl: url.origin + url.pathname.replace(/\/+$/, ''),
    host: url.host,
    ticketPrefix: text(json.ticketPrefix),
    defaultIssueType: text(json.jira?.defaultIssueType),
  }
}

export function issueUrl(baseUrl: string, key: string): string {
  return `${baseUrl}/browse/${key}`
}

export function resolveProject(flag: string | undefined, config: JiraConfig): string {
  const project = flag ?? config.ticketPrefix
  if (!project) throw new CliError('Не задан код проекта: укажите --project или ticketPrefix в .claude/dev-conventions.json.', EXIT.FAILURE)
  return project
}

export function resolveIssueType(flag: string | undefined, config: JiraConfig): string {
  const type = flag ?? config.defaultIssueType
  if (!type) throw new CliError('Не задан тип задачи: укажите --type или jira.defaultIssueType в .claude/dev-conventions.json.', EXIT.FAILURE)
  return type
}
