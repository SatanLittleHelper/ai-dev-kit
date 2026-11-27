import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseCreateRoadmapArgs } from '../cli/args.mts'
import { CliError } from '../src/errors.mts'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()
const fence = (text: string): string => `\`\`\`\n${text}\n\`\`\``
const section = (id: string, title: string): string => `## ${id}\n${fence(title)}\n${fence('h3. Контекст\nТекст.')}\n`
const DOC = ['# Стори: Пример', '', section('story', 'Пример роадмапа'), section('A1', 'Первый шаг'), section('B1', 'Второй шаг')].join('\n')

function prepare(): ReturnType<typeof sandbox> {
  fake.state.types = ['Story', 'Sub-task']
  const box = sandbox(fake)
  writeFileSync(join(box.cwd, 'tickets.md'), DOC)
  return box
}
const created = (box: { cwd: string }): { story: { key: string } | null; children: Record<string, { key: string }>; unknown: string | null } =>
  JSON.parse(readFileSync(join(box.cwd, 'tickets.created.json'), 'utf8'))

test('CR1 U1: разбор аргументов create-roadmap', () => {
  assert.deepEqual(parseCreateRoadmapArgs(['t.md']), { file: 't.md', dryRun: undefined, resolves: [] })
  assert.deepEqual(parseCreateRoadmapArgs(['t.md', '--resolve', 'A1=retry', '--resolve', 'B1=ABC-3', '--state', 's.json', '--dry-run']), { file: 't.md', dryRun: true, resolves: ['A1=retry', 'B1=ABC-3'], state: 's.json' })
  for (const args of [[], ['--dry-run'], ['t.md', '--nope'], ['t.md', '--resolve'], ['t.md', '--dry-run', '--no-dry-run']]) assert.throws(() => parseCreateRoadmapArgs(args), CliError)
})

test('CR1 I1: стори и подзадачи созданы, подзадачи — Sub-task с родителем', async () => {
  const box = prepare()
  const response = await box.run(['create-roadmap', 'tickets.md', '--no-dry-run'])

  assert.equal(response.code, 0, response.stderr)
  const result = JSON.parse(response.stdout)
  assert.equal(result.story.key, 'ABC-1')
  assert.deepEqual(result.children.map((child: { id: string; key: string }) => [child.id, child.key]), [['A1', 'ABC-2'], ['B1', 'ABC-3']])
  assert.deepEqual(fake.state.issues.map(issue => [issue.type, issue.parent]), [['Story', undefined], ['Sub-task', 'ABC-1'], ['Sub-task', 'ABC-1']])
  assert.equal(created(box).children.B1.key, 'ABC-3')
})

test('CR1 I2: типы берутся из настроек', async () => {
  fake.state.types = ['Epic', 'Task']
  const box = sandbox(fake, { jira: { roadmapStoryType: 'Epic', roadmapChildType: 'Task' } })
  writeFileSync(join(box.cwd, 'tickets.md'), DOC)
  const response = await box.run(['create-roadmap', 'tickets.md', '--no-dry-run'])

  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(fake.state.issues.map(issue => issue.type), ['Epic', 'Task', 'Task'])
})

test('CR1 I3: после сбоя повторный запуск продолжает с неготового', async () => {
  const box = prepare()
  fake.state.failMode = 'noKey'
  fake.state.failAfter = 2
  const first = await box.run(['create-roadmap', 'tickets.md', '--no-dry-run'])
  assert.equal(first.code, 5, first.stderr)
  assert.equal(created(box).unknown, 'B1')

  fake.state.failMode = 'none'
  const blocked = await box.run(['create-roadmap', 'tickets.md', '--no-dry-run'])
  assert.equal(blocked.code, 1)
  assert.match(blocked.stderr, /B1/)

  const resumed = await box.run(['create-roadmap', 'tickets.md', '--no-dry-run', '--resolve', 'B1=retry'])
  assert.equal(resumed.code, 0, resumed.stderr)
  assert.deepEqual(JSON.parse(resumed.stdout).skipped, ['story', 'A1'])
  assert.equal(fake.state.issues.length, 3)
})

test('CR1 I4: --resolve KEY принимает созданный тикет без повтора', async () => {
  const box = prepare()
  fake.state.failMode = 'noKey'
  fake.state.failAfter = 2
  await box.run(['create-roadmap', 'tickets.md', '--no-dry-run'])
  fake.state.failMode = 'none'
  const resumed = await box.run(['create-roadmap', 'tickets.md', '--no-dry-run', '--resolve', 'B1=ABC-77'])

  assert.equal(resumed.code, 0, resumed.stderr)
  assert.equal(fake.state.issues.length, 2)
  assert.equal(created(box).children.B1.key, 'ABC-77')
})

test('CR1 I5: --dry-run заполняет только форму, ничего не создаёт', async () => {
  const box = prepare()
  const response = await box.run(['create-roadmap', 'tickets.md', '--dry-run'])

  assert.equal(response.code, 0, response.stderr)
  const result = JSON.parse(response.stdout)
  assert.equal(result.dryRun, true)
  assert.deepEqual(result.planned, ['story', 'A1', 'B1'])
  assert.equal(fake.state.submits, 0)
  assert.equal(existsSync(join(box.cwd, 'tickets.created.json')), false)
})

test('CR1 I6: ошибка линтера и несовпадение с состоянием — код 1, Jira не трогается', async () => {
  const box = prepare()
  writeFileSync(join(box.cwd, 'tickets.md'), DOC.replace('Первый шаг', '[а] [б] [в] Первый'))
  const lint = await box.run(['create-roadmap', 'tickets.md', '--no-dry-run'])
  assert.equal(lint.code, 1)
  assert.match(lint.stderr, /title-prefixes/)

  writeFileSync(join(box.cwd, 'tickets.md'), DOC)
  writeFileSync(join(box.cwd, 's.json'), JSON.stringify({ steps: [{ id: 'A1' }] }))
  const state = await box.run(['create-roadmap', 'tickets.md', '--no-dry-run', '--state', 's.json'])
  assert.equal(state.code, 1)
  assert.match(state.stderr, /ticket-unknown/)
  assert.equal(fake.state.submits, 0)
})
