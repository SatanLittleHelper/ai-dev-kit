import type { Page } from 'playwright-core'
import { issueUrl } from '../config.mts'
import type { JiraConfig } from '../config.mts'
import { CliError, firstLine, unknownState } from '../errors.mts'
import { editSel as sel, transitionSel } from '../selectors.mts'
import { closeEditDialog, openEditDialog } from './issue-fields.mts'
import { readIssue } from './transition-issue.mts'

type Field = 'title' | 'description'

interface EditRequest {
  key: string
  title?: string
  body?: string
  config: JiraConfig
  dryRun: boolean
  timeoutMs: number
  // В пробном запуске ждёт, пока пользователь закроет видимое окно.
  pause?(): Promise<void>
}

interface EditResult {
  key: string
  url: string
  result: 'edited' | 'unchanged' | 'dry-run'
  changed: Field[]
}

const normalize = (value: string): string => value.replace(/\r\n/g, '\n').trimEnd()

// Меняет только переданные поля и только те, что отличаются от текущих.
export async function editIssue(page: Page, request: EditRequest): Promise<EditResult> {
  const { key, title, body, config } = request
  const url = issueUrl(config.baseUrl, key)
  page.setDefaultTimeout(request.timeoutMs)
  page.setDefaultNavigationTimeout(request.timeoutMs)

  await readIssue(page, url, key)
  await openEditDialog(page)
  const changed: Field[] = []
  if (title !== undefined && normalize(await sel.summaryField(page).inputValue()) !== normalize(title)) changed.push('title')
  if (body !== undefined && normalize(await sel.descriptionField(page).inputValue()) !== normalize(body)) changed.push('description')
  if (changed.length === 0) {
    await closeEditDialog(page)
    return { key, url, result: 'unchanged', changed }
  }
  if (changed.includes('title')) await sel.summaryField(page).fill(title!)
  if (changed.includes('description')) await sel.descriptionField(page).fill(body!)
  if (request.dryRun) {
    await request.pause?.()
    return { key, url, result: 'dry-run', changed }
  }

  // Сохранение необратимо: с этого места ретраев нет, любой сбой — «состояние неизвестно».
  try {
    await sel.submit(page).click()
    await sel.dialog(page).waitFor({ state: 'hidden' }).catch(() => undefined)
    if (await sel.dialog(page).isVisible()) {
      const reason = await transitionSel.error(page).isVisible() ? (await transitionSel.error(page).innerText()).trim() : 'диалог не закрылся'
      throw unknownState(`Jira не подтвердила сохранение: ${reason}.`)
    }
  } catch (error) {
    if (error instanceof CliError) throw error
    throw unknownState(`Сохранение не подтверждено (${firstLine(error)}).`)
  }
  return { key, url, result: 'edited', changed }
}
