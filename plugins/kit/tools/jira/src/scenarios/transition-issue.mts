import type { ElementHandle, Locator, Page } from 'playwright-core'
import { assertJiraSession } from '../browser.mts'
import { issueUrl } from '../config.mts'
import type { JiraConfig } from '../config.mts'
import { CliError, EXIT, firstLine } from '../errors.mts'
import { transitionSel as sel } from '../selectors.mts'
import { JIRA_STATUS } from '../statuses.mts'
import { assignIssue } from './assign-issue.mts'

type Target = 'in-progress' | 'review' | 'testing'
type AlreadyThere = 'already-in-progress' | 'already-in-review' | 'already-in-testing'

const TARGETS: Record<Target, { names: readonly string[]; already: AlreadyThere }> = {
  'in-progress': { names: [JIRA_STATUS.IN_PROGRESS, 'In Progress'], already: 'already-in-progress' },
  review: { names: [JIRA_STATUS.REVIEW, 'Review'], already: 'already-in-review' },
  testing: { names: [JIRA_STATUS.TESTING, 'Testing'], already: 'already-in-testing' },
}
const normalize = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase()
const matches = (value: string, names: readonly string[]): boolean => names.some(name => normalize(value) === normalize(name))

interface Request {
  target?: Target
  assignee?: string
  key: string
  config: JiraConfig
  dryRun: boolean
  timeoutMs: number
  pause?(): Promise<void>
}

interface TransitionResult {
  key: string
  url: string
  status: 'transitioned' | AlreadyThere | 'dry-run'
  issueStatus: string
  assignee?: string
}

async function assertIssue(page: Page, url: string, key: string, available = true): Promise<void> {
  assertJiraSession(page, url)
  const expected = new URL(url)
  const actual = new URL(page.url())
  const issueKey = sel.issueKey(page, key).filter({ visible: true }).first()

  if (!available || actual.origin !== expected.origin || actual.pathname.replace(/\/$/, '') !== expected.pathname ||
      (await issueKey.innerText().catch(() => '')).trim() !== key) {
    throw new CliError(`Карточка ${key} не найдена по ожидаемому адресу.`, EXIT.NOT_FOUND)
  }
}

export async function readIssue(page: Page, url: string, key: string): Promise<{ status: string; locator: Locator }> {
  const response = await page.goto(url)
  await assertIssue(page, url, key, response?.ok() ?? false)

  const locator = sel.classicStatus(page).or(sel.statusMenuTrigger(page)).filter({ visible: true })
  await locator.first().waitFor()
  const current = await sel.classicStatus(page).isVisible() ? sel.classicStatus(page) : sel.statusMenuTrigger(page)
  return { status: (await current.innerText()).trim(), locator: current }
}

async function availableActions(page: Page): Promise<Locator> {
  const classic = sel.classicActions(page)
  const trigger = sel.statusMenuTrigger(page)
  if (!await trigger.isVisible()) return classic.filter({ visible: true })
  const menuId = await trigger.getAttribute('aria-controls') ?? await trigger.getAttribute('aria-owns')
  if (!menuId) return classic.filter({ visible: true })

  await trigger.click()
  const menu = sel.menu(page, menuId)
  await menu.waitFor()
  const items = sel.menuActions(menu)
  // Jira заполняет раскрытое меню асинхронно.
  await items.first().waitFor().catch(() => undefined)
  return classic.or(items).filter({ visible: true })
}

type Action = ElementHandle<HTMLElement | SVGElement>

function describeAction(action: Action) {
  return action.evaluate((node, selectors) => ({
    label: node.querySelector(selectors.label)?.textContent ?? node.textContent ?? '',
    destination: node.querySelector(selectors.status)?.textContent ?? '',
    href: node.getAttribute('href'),
  }), { label: sel.menuActionLabel, status: sel.menuActionStatus })
}

async function chooseAction(page: Page, request: Request, statusNames: readonly string[]) {
  const actions = await (await availableActions(page)).elementHandles()
  const labels = await Promise.all(actions.map(describeAction))
  const preferred = (request.target ?? 'in-progress') === 'in-progress' ? request.config.inProgressTransition : undefined
  const found = labels.flatMap(({ label, destination }, index) => {
    const targetMatches = destination !== '' && matches(destination, statusNames)
    if (destination && !targetMatches) return []
    if (preferred) return matches(label, [preferred]) ? [index] : []
    return targetMatches || matches(label, statusNames) ? [index] : []
  })
  const names = statusNames.join(' / ')
  if (found.length === 0) throw new CliError(`Переход задачи ${request.key} в «${names}» не найден.`, EXIT.NOT_FOUND)
  if (found.length > 1) throw new CliError(`Найдено несколько переходов задачи ${request.key} в «${names}». Уточните jira.inProgressTransition.`, EXIT.FAILURE)
  const [index] = found
  const action = actions[index]
  if (await action.isDisabled()) throw new CliError(`Переход задачи ${request.key} в «${names}» недоступен.`, EXIT.NOT_FOUND)
  return { action, expected: labels[index] }
}

// Статус к этому моменту уже в целевом: при сбое назначения повторная команда сделает только его.
async function assignAfterTransition(page: Page, request: Request, issueStatus: string): Promise<void> {
  if (!request.assignee) return
  try {
    await assignIssue(page, request.assignee)
  } catch (error) {
    if (!(error instanceof CliError)) throw error
    throw new CliError(`${error.message} Задача ${request.key} в статусе «${issueStatus}»; повторная команда только назначит исполнителя.`, error.code)
  }
}

export async function transitionIssue(page: Page, request: Request): Promise<TransitionResult> {
  const { key, config, dryRun, pause, timeoutMs, assignee } = request
  const target = request.target ?? 'in-progress'
  const url = issueUrl(config.baseUrl, key)
  const names = target === 'in-progress' && config.inProgressStatus ? [config.inProgressStatus] : TARGETS[target].names
  const extra = assignee ? { assignee } : {}
  page.setDefaultTimeout(timeoutMs)
  page.setDefaultNavigationTimeout(timeoutMs)

  const initial = await readIssue(page, url, key)
  const alreadyThere = matches(initial.status, names)
  const selected = alreadyThere ? null : await chooseAction(page, request, names)
  if (dryRun) {
    await pause?.()
    return { key, url, status: 'dry-run', issueStatus: initial.status, ...extra }
  }
  if (!selected) {
    await assignAfterTransition(page, request, initial.status)
    return { key, url, status: TARGETS[target].already, issueStatus: initial.status, ...extra }
  }

  await assertIssue(page, url, key)
  const { action, expected } = selected
  const latest = await describeAction(action)
  if (latest.label !== expected.label || latest.destination !== expected.destination || latest.href !== expected.href) {
    throw new CliError(`Меню переходов задачи ${key} изменилось. Повторите команду.`, EXIT.FAILURE)
  }

  let confirmedStatus: string
  try {
    await action.click()
    const escaped = names.map(name => name.trim().split(/\s+/).map(RegExp.escape).join('\\s+'))
    const finished = initial.locator.filter({ hasText: new RegExp(`^\\s*(?:${escaped.join('|')})\\s*$`, 'i') })
    await finished.or(sel.error(page)).first().waitFor().catch(() => undefined)
    const failure = await sel.error(page).isVisible() ? (await sel.error(page).innerText()).trim() : ''
    const confirmed = await readIssue(page, url, key)
    if (!matches(confirmed.status, names)) throw new Error(failure || `Jira показывает статус «${confirmed.status}».`)
    confirmedStatus = confirmed.status
  } catch (error) {
    throw new CliError(`Не удалось подтвердить переход задачи ${key}: ${firstLine(error)}`, EXIT.UNKNOWN)
  }
  await assignAfterTransition(page, request, confirmedStatus)
  return { key, url, status: 'transitioned', issueStatus: confirmedStatus, ...extra }
}
