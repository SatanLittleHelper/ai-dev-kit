import type { Locator, Page } from 'playwright-core'
import { CliError, EXIT } from './errors.mts'
import { sel } from './selectors.mts'

export const notFound = (field: string, value: string): CliError => new CliError(`Поле «${field}»: значение «${value}» не найдено.`, EXIT.NOT_FOUND)

export async function choose(page: Page, field: Locator, value: string, accept: (label: string) => boolean, fieldName: string): Promise<void> {
  await field.fill(value)
  // У Jira Server при пустой выдаче варианты не появляются: таймаут ожидания значит «ничего не найдено», а не сбой.
  await sel.listboxReady(page).waitFor({ state: 'attached' }).catch(() => undefined)
  const labels = (await sel.options(page).allInnerTexts()).map(label => label.trim())
  const index = labels.findIndex(accept)
  if (index < 0) throw notFound(fieldName, value)
  await sel.options(page).nth(index).click()
}
