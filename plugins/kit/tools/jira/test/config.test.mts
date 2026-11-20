import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { issueUrl, loadConfig, resolveIssueType, resolveProject } from '../src/config.mts'
import type { JiraConfig } from '../src/config.mts'
import { CliError, EXIT } from '../src/errors.mts'

const read = (path: string) => readFileSync(path, 'utf8')

function project(content: string | null): string {
  const cwd = mkdtempSync(join(tmpdir(), 'jira-config-'))
  if (content !== null) {
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(join(cwd, '.claude', 'dev-conventions.json'), content)
  }
  return cwd
}

const FULL = JSON.stringify({ ticketPrefix: 'ABC', jira: { baseUrl: 'https://jira.company.ru', defaultIssueType: 'Task' } })
const failure = (pattern: RegExp) => (error: unknown) => error instanceof CliError && error.code === EXIT.FAILURE && pattern.test(error.message)
const base: JiraConfig = { baseUrl: 'https://jira.company.ru', host: 'jira.company.ru', ticketPrefix: 'ABC', defaultIssueType: 'Task' }

test('U1: конфиг читается из dev-conventions.json', () => {
  assert.deepEqual(loadConfig(project(FULL), read), base)
})

test('U2: завершающий слэш в baseUrl не ломает ссылки и хост', () => {
  const config = loadConfig(project(JSON.stringify({ jira: { baseUrl: 'https://jira.company.ru/' } })), read)
  assert.equal(config.host, 'jira.company.ru')
  assert.equal(issueUrl(config.baseUrl, 'ABC-1'), 'https://jira.company.ru/browse/ABC-1')
})

test('U3: нет jira.baseUrl — понятная ошибка', () => {
  assert.throws(() => loadConfig(project(JSON.stringify({ ticketPrefix: 'ABC' })), read), failure(/jira\.baseUrl/))
})

test('U4: нет файла dev-conventions.json — ошибка с путём', () => {
  const cwd = project(null)
  assert.throws(() => loadConfig(cwd, read), failure(new RegExp('dev-conventions\\.json')))
})

test('U5: файл конфига не JSON — ошибка с именем файла', () => {
  assert.throws(() => loadConfig(project('{oops'), read), failure(/dev-conventions\.json.*JSON/))
})

test('U6: флаг --project перекрывает ticketPrefix', () => {
  assert.equal(resolveProject('XYZ', base), 'XYZ')
})

test('U7: без флага проект берётся из ticketPrefix', () => {
  assert.equal(resolveProject(undefined, base), 'ABC')
})

test('U8: нет ни флага, ни ticketPrefix — ошибка', () => {
  assert.throws(() => resolveProject(undefined, { ...base, ticketPrefix: undefined }), failure(/ticketPrefix|--project/))
})

test('U9: флаг --type перекрывает defaultIssueType', () => {
  assert.equal(resolveIssueType('Bug', base), 'Bug')
})

test('U10: без флага тип берётся из defaultIssueType', () => {
  assert.equal(resolveIssueType(undefined, base), 'Task')
})

test('U11: нет ни флага, ни defaultIssueType — ошибка', () => {
  assert.throws(() => resolveIssueType(undefined, { ...base, defaultIssueType: undefined }), failure(/defaultIssueType|--type/))
})
