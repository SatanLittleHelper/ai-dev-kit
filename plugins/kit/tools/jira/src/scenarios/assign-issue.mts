import type { Page } from 'playwright-core'
import { choose } from '../choose.mts'
import { CliError, EXIT } from '../errors.mts'
import { transitionSel as sel } from '../selectors.mts'

// Назначает исполнителя через диалог Assign на карточке. Повторное назначение того же пользователя ничего не меняет.
export async function assignIssue(page: Page, email: string): Promise<void> {
  await sel.assignLink(page).click()
  await sel.assignDialog(page).waitFor()
  await choose(page, sel.assignField(page), email, label => label.toLowerCase().includes(email.toLowerCase()), 'Исполнитель')
  await sel.assignSubmit(page).click()
  await sel.assignDialog(page).waitFor({ state: 'hidden' }).catch(() => undefined)
  if (await sel.assignDialog(page).isVisible() || await sel.error(page).isVisible()) {
    const reason = await sel.error(page).isVisible() ? (await sel.error(page).innerText()).trim() : 'диалог не закрылся'
    throw new CliError(`Не удалось назначить исполнителя ${email}: ${reason}.`, EXIT.UNKNOWN)
  }
}
