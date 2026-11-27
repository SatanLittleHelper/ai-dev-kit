import type { Page } from 'playwright-core'
import { CliError, EXIT, firstLine } from '../errors.mts'
import { editSel } from '../selectors.mts'

// Открывает диалог Edit в режиме Text: Visual-редактор искажает Wiki Markup.
export async function openEditDialog(page: Page): Promise<void> {
  try {
    await editSel.link(page).click()
    await editSel.dialog(page).waitFor()
    if (await editSel.textTab(page).isVisible()) await editSel.textTab(page).click()
  } catch (error) {
    throw new CliError(`Не удалось открыть диалог редактирования (нет прав на правку?): ${firstLine(error)}.`, EXIT.FAILURE)
  }
}

export async function closeEditDialog(page: Page): Promise<void> {
  await editSel.cancel(page).click()
  await editSel.dialog(page).waitFor({ state: 'hidden' })
}
