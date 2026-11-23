import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { blocked } from './responses.mts'
import type { BlockedResponse, NeedsInputResponse } from './types.mts'

const KEY = /^[A-Z][A-Z0-9_]*-\d+$/
const BROWSE_PATH = /\/browse\/([A-Z][A-Z0-9_]*-\d+)\/?$/

export const isIssueKey = (value: string): boolean => KEY.test(value)

interface TicketConfig {
  ticketPrefix?: unknown
  jira?: { baseUrl?: unknown }
}

interface TrackedTicket {
  key: string
  jiraInstance?: string
}

function readConfig(root: string): TicketConfig | BlockedResponse {
  const path = join(root, '.claude', 'dev-conventions.json')
  try {
    const config: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (config === null || typeof config !== 'object' || Array.isArray(config)) throw new Error('Нужен JSON-объект')
    return config as TicketConfig
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    return blocked(`Не удалось прочитать настройки задачи из ${path}.`)
  }
}

function jiraInstance(value: unknown): string | null {
  const url = typeof value === 'string' ? URL.parse(value) : null
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export function checkJiraInstance(root: string, expected: string): BlockedResponse | undefined {
  const config = readConfig(root)
  if ('result' in config) return config
  if (jiraInstance(config.jira?.baseUrl) !== expected) {
    return blocked(`Настройка jira.baseUrl должна указывать на экземпляр Jira из ссылки задачи: ${expected}.`)
  }
}

function keyFromUrl(input: string, config: TicketConfig): TrackedTicket | BlockedResponse {
  const url = URL.parse(input)
  const path = url?.pathname.match(BROWSE_PATH)
  if (!url || !path || url.protocol !== 'https:' || url.username || url.password) {
    return blocked('Укажите ключ задачи Jira или HTTPS-ссылку на карточку вида /browse/ABC-123.')
  }

  const instance = url.origin + url.pathname.slice(0, path.index)
  if (config.jira?.baseUrl !== undefined && jiraInstance(config.jira.baseUrl) !== instance) {
    return blocked('Ссылка не указывает на настроенный экземпляр Jira.')
  }
  return { key: path[1], jiraInstance: instance }
}

function branchName(root: string): string {
  try {
    return execFileSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

export function resolveTrackedTicket(root: string, id?: string): TrackedTicket | BlockedResponse | NeedsInputResponse {
  const input = id?.trim()
  if (input && isIssueKey(input)) return { key: input }

  const config = readConfig(root)
  if ('result' in config) return config
  if (input !== undefined) return keyFromUrl(input, config)

  const prefix = typeof config.ticketPrefix === 'string' ? config.ticketPrefix.trim().toUpperCase() : ''
  const matches = branchName(root).matchAll(/(?<![A-Z0-9_])([A-Z][A-Z0-9_]*-\d+)(?![A-Z0-9_])/g)
  const keys = [...new Set(Array.from(matches, match => match[1]))]
    .filter(key => !prefix || key.startsWith(`${prefix}-`))
  if (keys.length === 1) return { key: keys[0] }

  return {
    result: 'needs-input',
    question: 'Какую задачу Jira взять в работу?',
    options: ['Передать ключ задачи или ссылку на карточку', 'Подготовить задачу через jira-writer'],
  }
}
