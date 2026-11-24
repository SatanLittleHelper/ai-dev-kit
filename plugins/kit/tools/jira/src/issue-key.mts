// Единственное описание формата ключа задачи Jira (ABC-123).
const BODY = '[A-Z][A-Z0-9_]*-\\d+'

export const ISSUE_KEY = new RegExp(`^${BODY}$`)
const AT_START = new RegExp(`^${BODY}`)
const IN_TEXT = new RegExp(`(?<![A-Z0-9_])(${BODY})(?![A-Z0-9_])`, 'g')

export const isIssueKey = (value: string): boolean => ISSUE_KEY.test(value)
export const keyAtStart = (text: string): string | undefined => text.match(AT_START)?.[0]
export const issueKeysIn = (text: string): string[] => Array.from(text.matchAll(IN_TEXT), match => match[1])
