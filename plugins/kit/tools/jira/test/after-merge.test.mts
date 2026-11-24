import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseAfterMergeArgs } from '../cli/args.mts'
import { findIssueKey, planAfterMerge, withTesterEmail } from '../src/after-merge.mts'
import { CliError } from '../src/errors.mts'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()
const KEY = 'ABC-42'
const TESTER = 'petrov@example.com'
const configured = { ticketPrefix: 'ABC', jira: { baseUrl: 'https://jira.example.com' } }

test('M1 U1: ключ берётся из ветки, затем из заголовка, с учётом ticketPrefix', () => {
  assert.equal(findIssueKey(['ABC-42-fix-login', 'Исправил вход'], 'ABC'), 'ABC-42')
  assert.equal(findIssueKey(['feature/login', 'ABC-7: Исправил вход'], 'ABC'), 'ABC-7')
  assert.equal(findIssueKey(['XYZ-1-fix', 'ABC-2 заголовок'], 'ABC'), 'ABC-2')
  assert.equal(findIssueKey(['XYZ-1-fix'], undefined), 'XYZ-1')
  assert.equal(findIssueKey(['feature/login', 'Исправил вход'], 'ABC'), undefined)
})

test('M1 U2: план — пропуск без Jira и без ключа', () => {
  assert.deepEqual(planAfterMerge({}, { headRef: 'ABC-1-x', title: '', noAssignee: false }), { result: 'skipped', reason: 'no-jira' })
  assert.deepEqual(planAfterMerge(configured, { headRef: 'login', title: '', noAssignee: false }), { result: 'skipped', reason: 'no-key' })
})

test('M1 U3: план — email из флага главнее сохранённого, без email нужен ввод, --no-assignee его не требует', () => {
  const saved = { ...configured, jira: { ...configured.jira, testerEmail: 'saved@example.com' } }
  const input = { headRef: 'ABC-1-x', title: '', noAssignee: false }
  assert.deepEqual(planAfterMerge(saved, input), { result: 'ready', key: 'ABC-1', assignee: 'saved@example.com' })
  assert.deepEqual(planAfterMerge(saved, { ...input, testerEmail: TESTER }), { result: 'ready', key: 'ABC-1', assignee: TESTER })
  assert.deepEqual(planAfterMerge(configured, input), { result: 'needs-tester-email', key: 'ABC-1' })
  assert.deepEqual(planAfterMerge(configured, { ...input, noAssignee: true }), { result: 'ready', key: 'ABC-1' })
})

test('M1 U4: withTesterEmail дописывает ключ и сохраняет остальное', () => {
  const raw = JSON.stringify({ ticketPrefix: 'ABC', jira: { baseUrl: 'https://j', dryRun: true } })
  assert.deepEqual(JSON.parse(withTesterEmail(raw, TESTER)), { ticketPrefix: 'ABC', jira: { baseUrl: 'https://j', dryRun: true, testerEmail: TESTER } })
})

test('M1 U5: разбор аргументов after-merge', () => {
  assert.deepEqual(
    parseAfterMergeArgs(['--head-ref', 'ABC-1-x', '--title', 'ABC-1: Заголовок', '--tester-email', TESTER, '--no-dry-run']),
    { headRef: 'ABC-1-x', title: 'ABC-1: Заголовок', testerEmail: TESTER, noAssignee: false, dryRun: false },
  )
  assert.deepEqual(parseAfterMergeArgs(['--head-ref', 'x', '--no-assignee']), { headRef: 'x', title: '', noAssignee: true, dryRun: undefined })
  for (const args of [[], ['--title', 'a'], ['--head-ref', 'x', '--tester-email', 'petrov'], ['--head-ref', 'x', '--no-assignee', '--tester-email', TESTER]]) {
    assert.throws(() => parseAfterMergeArgs(args), CliError)
  }
})

function issue(): void {
  fake.state.issues.push({ key: KEY, project: 'ABC', type: 'Task', summary: 'Задача', description: '', status: 'Open' })
  fake.state.transitionLayout = 'menu'
  fake.state.transitionOptions = [{ label: 'На тестирование', destination: 'Тестирование' }]
}

test('M1 I1: переход и назначение; email из флага сохраняется в dev-conventions', async () => {
  issue()
  const box = sandbox(fake)
  const response = await box.run(['after-merge', '--head-ref', `${KEY}-fix`, '--title', 'Заголовок', '--tester-email', TESTER, '--no-dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), {
    result: 'done', key: KEY, url: `${fake.url}/browse/${KEY}`, status: 'transitioned', issueStatus: 'Тестирование', assignee: TESTER,
  })
  assert.equal(fake.state.issues[0].assignee, 'petrov')
  const saved = JSON.parse(readFileSync(join(box.cwd, '.claude', 'dev-conventions.json'), 'utf8'))
  assert.equal(saved.jira.testerEmail, TESTER)
  assert.equal(saved.jira.baseUrl, fake.url)
})

test('M1 I2: сохранённый jira.testerEmail используется без флага', async () => {
  issue()
  const response = await sandbox(fake, { jira: { testerEmail: TESTER } }).run(['after-merge', '--head-ref', `${KEY}-fix`, '--no-dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.equal(JSON.parse(response.stdout).assignee, TESTER)
  assert.equal(fake.state.issues[0].assignee, 'petrov')
})

test('M1 I3: без email — needs-tester-email, Jira не тронута', async () => {
  issue()
  const response = await sandbox(fake).run(['after-merge', '--head-ref', `${KEY}-fix`, '--no-dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { result: 'needs-tester-email', key: KEY })
  assert.equal(fake.state.transitions, 0)
})

test('M1 I4: --no-assignee — только переход', async () => {
  issue()
  const response = await sandbox(fake).run(['after-merge', '--head-ref', `${KEY}-fix`, '--no-assignee', '--no-dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.equal(JSON.parse(response.stdout).result, 'done')
  assert.equal(fake.state.assignments, 0)
})

test('M1 I5: нет ключа в ветке и заголовке — skipped no-key', async () => {
  const response = await sandbox(fake).run(['after-merge', '--head-ref', 'feature/login', '--title', 'Без ключа'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { result: 'skipped', reason: 'no-key' })
})
