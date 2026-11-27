import type { Locator, Page } from 'playwright-core'
import { ISSUE_KEY } from './issue-key.mts'

// Селекторы диалога Create.
// Поиск не зависит от языка интерфейса: у Jira Server берутся id и атрибуты разметки, а английские подписи нужны для Cloud-подобной разметки (её имитирует тестовая Jira). Локаторы объединены через or().
const FIELD_IDS: Record<string, string> = {
  Project: '#project-field',
  'Issue Type': '#issuetype-field',
  Summary: '#summary',
  Description: '#description',
  Assignee: '#assignee-field',
}

const transitionAction = 'a.issueaction-workflow-transition, button.issueaction-workflow-transition'

export const transitionSel = {
  issueKey: (page: Page, key: string): Locator => page.locator('#key-val').or(sel.issueHeading(page, key)),
  classicStatus: (page: Page): Locator => page.locator('#status-val'),
  statusMenuTrigger: (page: Page): Locator => page.locator('#opsbar-transitions_more'),
  classicActions: (page: Page): Locator => page.locator('#opsbar-opsbar-transitions').locator(transitionAction),
  menu: (page: Page, id: string): Locator => page.locator(`[id=${JSON.stringify(id)}]`),
  menuActions: (menu: Locator): Locator => menu.getByRole('menuitem').or(menu.locator(transitionAction)),
  menuActionLabel: '.transition-label > .workflow-cell:first-child > span',
  menuActionStatus: '.transition-label .jira-issue-status-lozenge',
  error: (page: Page): Locator => page.locator('.aui-message-error, [role="alert"][data-type="error"]').first(),
  assigneeValue: (page: Page): Locator => page.locator('#assignee-val'),
  assignLink: (page: Page): Locator => page.locator('#assign-issue'),
  assignDialog: (page: Page): Locator => page.locator('#assign-dialog'),
  assignField: (page: Page): Locator => page.locator('#assign-dialog #assignee-field'),
  assignSubmit: (page: Page): Locator => page.locator('#assign-dialog #assign-issue-form-submit'),
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
  createdLink: (page: Page): Locator => page.getByRole('status').getByRole('link', { name: ISSUE_KEY }).or(page.locator('a.issue-created-key')).first(),
  errorAlert: (page: Page): Locator => page.getByRole('alert'),
  issueHeading: (page: Page, key: string): Locator => page.getByRole('heading', { name: key, exact: true }),
}

export const editSel = {
  title: (page: Page): Locator => page.locator('#summary-val'),
  link: (page: Page): Locator => page.locator('#edit-issue'),
  dialog: (page: Page): Locator => page.locator('#edit-issue-dialog'),
  summaryField: (page: Page): Locator => page.locator('#edit-issue-dialog #summary'),
  descriptionField: (page: Page): Locator => page.locator('#edit-issue-dialog #description'),
  textTab: (page: Page): Locator => page.locator('#edit-issue-dialog [data-mode="source"] button'),
  submit: (page: Page): Locator => page.locator('#edit-issue-dialog #edit-issue-submit'),
  cancel: (page: Page): Locator => page.locator('#edit-issue-dialog .cancel'),
}

export const commentSel = {
  link: (page: Page): Locator => page.locator('#comment-issue').or(page.locator('#footer-comment-button')).first(),
  field: (page: Page): Locator => page.locator('#addcomment textarea#comment'),
  textTab: (page: Page): Locator => page.locator('#addcomment [data-mode="source"] button'),
  submit: (page: Page): Locator => page.locator('#addcomment #issue-comment-add-submit'),
  comments: (page: Page): Locator => page.locator('.activity-comment'),
}
