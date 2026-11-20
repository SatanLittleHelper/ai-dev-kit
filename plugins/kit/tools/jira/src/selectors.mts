import type { Locator, Page } from 'playwright-core'

// Все селекторы диалога Create в одном месте: при обновлении Jira правится только этот файл.
export const sel = {
  openCreate: (page: Page): Locator => page.getByRole('button', { name: 'Create', exact: true }),
  dialog: (page: Page): Locator => page.getByRole('dialog', { name: 'Create Issue' }),
  field: (dialog: Locator, label: string): Locator => dialog.getByLabel(label, { exact: true }),
  tab: (dialog: Locator, name: string): Locator => dialog.getByRole('tab', { name, exact: true }),
  assignToMe: (dialog: Locator): Locator => dialog.getByRole('button', { name: 'Assign to me', exact: true }),
  submitButton: (dialog: Locator): Locator => dialog.getByRole('button', { name: 'Create', exact: true }),
  listboxReady: (page: Page): Locator => page.locator('[role="listbox"][aria-busy="false"]'),
  options: (page: Page): Locator => page.getByRole('option'),
  createdLink: (page: Page): Locator => page.getByRole('status').getByRole('link', { name: /^[A-Z][A-Z0-9_]*-\d+$/ }),
  errorAlert: (page: Page): Locator => page.getByRole('alert'),
  issueHeading: (page: Page, key: string): Locator => page.getByRole('heading', { name: key, exact: true }),
}
