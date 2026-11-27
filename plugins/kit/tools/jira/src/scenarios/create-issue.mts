import type { Locator, Page } from 'playwright-core'
import { openJira } from '../browser.mts'
import { issueUrl } from '../config.mts'
import { CliError, EXIT, firstLine } from '../errors.mts'
import { sel } from '../selectors.mts'
import { keyAtStart } from '../issue-key.mts'
import { choose, notFound } from '../choose.mts'

interface ResolvedRequest {
  project: string
  type: string
  title: string
  body: string
  assignee?: string
  parent?: string
  sprint?: string
  dryRun?: boolean
}

interface DryRunResult {
  dryRun: true
  project: string
  type: string
  title: string
}

interface CreatedIssue {
  key: string
  url: string
}

export interface CreateContext {
  baseUrl: string
  timeoutMs: number
  progress(message: string): void
  // Вызывается в пробном запуске после заполнения формы: в видимом окне ждёт, пока пользователь его закроет.
  pause?(): Promise<void>
}

async function chooseType(page: Page, dialog: Locator, type: string): Promise<void> {
  const select = sel.field(dialog, 'Issue Type')
  // В Jira Server тип выбирается в поле с подсказками, а не в нативном select.
  if (await select.evaluate(node => node.tagName) !== 'SELECT') {
    await choose(page, select, type, label => label === type, 'Тип задачи')
    return
  }
  const labels = (await select.locator('option').allInnerTexts()).map(label => label.trim())
  if (!labels.includes(type)) throw notFound('Тип задачи', type)
  await select.selectOption({ label: type })
}

async function fillOptionalFields(page: Page, dialog: Locator, request: ResolvedRequest, context: CreateContext): Promise<void> {
  if (request.assignee === 'me') {
    context.progress('Исполнитель: я')
    await sel.assignToMe(dialog).click()
  } else if (request.assignee) {
    context.progress(`Исполнитель ${request.assignee}`)
    await choose(page, sel.field(dialog, 'Assignee'), request.assignee, label => label.endsWith(`(${request.assignee})`), 'Исполнитель')
  }
  if (request.parent) {
    context.progress(`Родитель ${request.parent}`)
    await choose(page, sel.field(dialog, 'Parent'), request.parent, label => label === request.parent || label.startsWith(`${request.parent} `), 'Родитель')
  }
  if (request.sprint) {
    context.progress(`Спринт ${request.sprint}`)
    await choose(page, sel.field(dialog, 'Sprint'), request.sprint, label => label === request.sprint, 'Спринт')
  }
}

const unknownState = (reason: string): CliError => new CliError(`${reason} Состояние неизвестно, проверьте Jira.`, EXIT.UNKNOWN)

async function verifyOpens(page: Page, key: string, url: string, context: CreateContext): Promise<void> {
  try {
    const response = await page.goto(url)
    if (!response?.ok() || !(await sel.issueHeading(page, key).isVisible())) context.progress(`Предупреждение: задача ${key} создана, но страница ${url} не подтвердилась.`)
  } catch (error) {
    context.progress(`Предупреждение: задача ${key} создана, но страница ${url} не открылась (${firstLine(error)}).`)
  }
}

async function submit(page: Page, dialog: Locator, context: CreateContext): Promise<CreatedIssue> {
  // Create необратим: с этого места ретраев нет, любая ошибка (в том числе сбой самого клика, который мог уже отправить форму) означает «состояние неизвестно».
  try {
    await sel.submitButton(dialog).click()
    await sel.createdLink(page).or(sel.errorAlert(page)).first().waitFor()
    // Флаг успеха Jira Server тоже может иметь role="alert", поэтому ошибка — только когда ключа задачи нет.
    if (await sel.createdLink(page).count() === 0 && await sel.errorAlert(page).count() > 0) {
      throw unknownState(`Jira показала ошибку после Create: ${(await sel.errorAlert(page).first().innerText()).trim()}.`)
    }
    // В Jira Server текст ссылки — «KEY-1 - заголовок», поэтому ключ берём только из начала.
    const key = keyAtStart((await sel.createdLink(page).innerText()).trim())
    if (!key) throw unknownState('Не удалось выделить ключ созданной задачи.')
    const url = issueUrl(context.baseUrl, key)
    // Ключ уже получен — задача создана. Открытие страницы только дополнительная проверка: её сбой (например, таймаут медленной Jira) не должен выдавать успех за «состояние неизвестно».
    await verifyOpens(page, key, url, context)
    return { key, url }
  } catch (error) {
    if (error instanceof CliError) throw error
    throw unknownState(`Ключ созданной задачи не получен (${firstLine(error)}).`)
  }
}

export async function createIssue(page: Page, context: CreateContext, request: ResolvedRequest): Promise<CreatedIssue | DryRunResult> {
  page.setDefaultTimeout(context.timeoutMs)
  context.progress('Открываю Jira')
  await openJira(page, context.baseUrl)
  await sel.openCreate(page).click()
  const dialog = sel.dialog(page)
  await dialog.waitFor()
  context.progress(`Проект ${request.project}`)
  await choose(page, sel.field(dialog, 'Project'), request.project, label => label.endsWith(`(${request.project})`), 'Проект')
  await chooseType(page, dialog, request.type)
  await sel.field(dialog, 'Summary').fill(request.title)
  // Visual-редактор искажает Wiki Markup — вводим описание в режиме Text.
  await sel.tab(dialog, 'Text').click()
  await sel.field(dialog, 'Description').fill(request.body)
  await fillOptionalFields(page, dialog, request, context)
  if (request.dryRun) {
    context.progress('Пробный запуск: Create не нажимаю, ничего не сохраняется')
    await context.pause?.()
    return { dryRun: true, project: request.project, type: request.type, title: request.title }
  }
  context.progress('Нажимаю Create')
  return submit(page, dialog, context)
}
