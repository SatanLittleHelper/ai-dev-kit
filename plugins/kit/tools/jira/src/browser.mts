import type { BrowserContext, Page } from 'playwright-core'
import { CliError, EXIT, firstLine } from './errors.mts'
import type { PlaywrightModule } from './profile.mts'

function isAppPage(url: string, baseUrl: string): boolean {
  const current = new URL(url)
  const base = new URL(baseUrl)
  return current.origin === base.origin && !/\/(login|sso|auth)(\/|$|\.)/i.test(current.pathname)
}

export async function launch(pw: PlaywrightModule, profileDir: string, headless: boolean): Promise<BrowserContext> {
  try {
    return await pw.chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless })
  } catch (error) {
    throw new CliError(`Не удалось запустить Google Chrome (${firstLine(error)}). Установите Chrome.`, EXIT.FAILURE)
  }
}

export async function openJira(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl)
  assertJiraSession(page, baseUrl)
}

export function assertJiraSession(page: Page, baseUrl: string): void {
  if (!isAppPage(page.url(), baseUrl)) throw new CliError('Сессия Jira не активна: выполните jira login.', EXIT.LOGIN)
}

export const whenClosed = (context: BrowserContext): Promise<void> => new Promise(resolve => { context.on('close', () => resolve()) })

export async function withSession<T>(
  pw: PlaywrightModule,
  profileDir: string,
  headless: boolean,
  action: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await launch(pw, profileDir, headless)
  try {
    const page = context.pages()[0] ?? await context.newPage()
    return await action(page)
  } finally {
    // Пользователь мог уже закрыть окно (пробный запуск) — повторное закрытие не ошибка.
    await context.close().catch(() => {})
  }
}
