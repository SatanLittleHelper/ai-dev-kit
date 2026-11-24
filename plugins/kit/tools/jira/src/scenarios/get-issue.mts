import type { Page } from 'playwright-core'
import { issueUrl } from '../config.mts'
import type { JiraConfig } from '../config.mts'
import { transitionSel as sel } from '../selectors.mts'
import { readIssue } from './transition-issue.mts'

const UNASSIGNED = ['unassigned', 'не назначен', 'не назначена', 'неназначен', 'неназначена']

interface GetRequest {
  key: string
  config: JiraConfig
  timeoutMs: number
}

interface GetResult {
  key: string
  url: string
  issueStatus: string
  assignee: string | null
}

// Только читает карточку: статус и отображаемое имя исполнителя (email Jira на карточке не показывает).
export async function getIssue(page: Page, request: GetRequest): Promise<GetResult> {
  const { key, config, timeoutMs } = request
  const url = issueUrl(config.baseUrl, key)
  page.setDefaultTimeout(timeoutMs)
  page.setDefaultNavigationTimeout(timeoutMs)

  const { status } = await readIssue(page, url, key)
  const raw = (await sel.assigneeValue(page).first().innerText().catch(() => '')).trim().replace(/\s+/g, ' ')
  const assignee = raw && !UNASSIGNED.includes(raw.toLowerCase()) ? raw : null
  return { key, url, issueStatus: status, assignee }
}
