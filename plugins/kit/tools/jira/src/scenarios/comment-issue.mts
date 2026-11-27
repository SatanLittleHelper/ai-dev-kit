import type { Page } from 'playwright-core'
import { issueUrl } from '../config.mts'
import type { JiraConfig } from '../config.mts'
import { CliError, firstLine, unknownState } from '../errors.mts'
import { commentSel as sel, transitionSel } from '../selectors.mts'
import { readIssue } from './transition-issue.mts'

interface CommentRequest {
  key: string
  body: string
  config: JiraConfig
  dryRun: boolean
  timeoutMs: number
  // В пробном запуске ждёт, пока пользователь закроет видимое окно.
  pause?(): Promise<void>
}

interface CommentResult {
  key: string
  url: string
  result: 'commented' | 'dry-run'
}

export async function commentIssue(page: Page, request: CommentRequest): Promise<CommentResult> {
  const { key, body, config } = request
  const url = issueUrl(config.baseUrl, key)
  page.setDefaultTimeout(request.timeoutMs)
  page.setDefaultNavigationTimeout(request.timeoutMs)

  await readIssue(page, url, key)
  await sel.link(page).click()
  await sel.field(page).waitFor()
  // Visual-редактор искажает Wiki Markup — пишем в режиме Text, если вкладка есть.
  if (await sel.textTab(page).isVisible()) await sel.textTab(page).click()
  await sel.field(page).fill(body)
  if (request.dryRun) {
    await request.pause?.()
    return { key, url, result: 'dry-run' }
  }

  // Добавление необратимо: с этого места ретраев нет, любой сбой — «состояние неизвестно».
  const before = await sel.comments(page).count()
  try {
    await sel.submit(page).click()
    await sel.comments(page).nth(before).or(transitionSel.error(page)).first().waitFor()
    if (await sel.comments(page).count() <= before) {
      throw unknownState(`Jira показала ошибку после добавления комментария: ${(await transitionSel.error(page).innerText()).trim()}.`)
    }
  } catch (error) {
    if (error instanceof CliError) throw error
    throw unknownState(`Комментарий не подтверждён (${firstLine(error)}).`)
  }
  return { key, url, result: 'commented' }
}
