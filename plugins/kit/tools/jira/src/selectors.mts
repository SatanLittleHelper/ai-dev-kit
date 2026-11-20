import type { Locator, Page } from 'playwright-core'

// Все селекторы диалога Create в одном месте: при обновлении Jira правится только этот файл.
// Поиск не зависит от языка интерфейса: у Jira Server берутся id и атрибуты разметки, а английские подписи нужны для Cloud-подобной разметки (её имитирует тестовая Jira). Локаторы объединены через or().
const FIELD_IDS: Record<string, string> = {
  Project: '#project-field',
  'Issue Type': '#issuetype-field',
  Summary: '#summary',
  Description: '#description',
  Assignee: '#assignee-field',
}
const TAB_SELECTORS: Record<string, string> = { Text: '[data-mode="source"] button' }

export const sel = {
  openCreate: (page: Page): Locator => page.getByRole('button', { name: 'Create', exact: true }).or(page.locator('#create_link')),
  dialog: (page: Page): Locator => page.getByRole('dialog', { name: 'Create Issue' }).or(page.locator('#create-issue-dialog')),
  field: (dialog: Locator, label: string): Locator => {
    const byLabel = dialog.getByLabel(label, { exact: true })
    return FIELD_IDS[label] ? byLabel.or(dialog.locator(FIELD_IDS[label])) : byLabel
  },
  tab: (dialog: Locator, name: string): Locator => {
    const byRole = dialog.getByRole('tab', { name, exact: true })
    return TAB_SELECTORS[name] ? byRole.or(dialog.locator(TAB_SELECTORS[name])) : byRole
  },
  assignToMe: (dialog: Locator): Locator => dialog.getByRole('button', { name: 'Assign to me', exact: true }).or(dialog.locator('#assign-to-me-trigger')),
  submitButton: (dialog: Locator): Locator => dialog.getByRole('button', { name: 'Create', exact: true }).or(dialog.locator('#create-issue-submit')),
  listboxReady: (page: Page): Locator => page.locator('[role="listbox"][aria-busy="false"]').or(page.locator('a.aui-list-item-link[role="option"]')).first(),
  options: (page: Page): Locator => page.getByRole('option').and(page.locator(':not(option)')),
  createdLink: (page: Page): Locator => page.getByRole('status').getByRole('link', { name: /^[A-Z][A-Z0-9_]*-\d+$/ }).or(page.locator('a.issue-created-key')).first(),
  errorAlert: (page: Page): Locator => page.getByRole('alert'),
  issueHeading: (page: Page, key: string): Locator => page.getByRole('heading', { name: key, exact: true }),
}
