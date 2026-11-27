import type { Page } from 'playwright-core'
import { issueUrl } from '../config.mts'
import type { JiraConfig } from '../config.mts'
import { transitionSel as sel } from '../selectors.mts'
import { editSel } from '../selectors.mts'
import { closeEditDialog, openEditDialog } from './issue-fields.mts'
import { readIssue } from './transition-issue.mts'

const UNASSIGNED = ['unassigned', 'не назначен', 'не назначена', 'неназначен', 'неназначена']

interface GetRequest {
  key: string
  config: JiraConfig
  timeoutMs: number
  withDescription?: boolean
}

interface GetResult {
  key: string
  url: string
  title: string
  description?: string
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
  const title = (await editSel.title(page).innerText().catch(() => '')).trim()
  const result: GetResult = { key, url, title, issueStatus: status, assignee }
  if (request.withDescription) {
    await openEditDialog(page)
    result.description = await editSel.descriptionField(page).inputValue()
    await closeEditDialog(page)
  }
  return result
}
