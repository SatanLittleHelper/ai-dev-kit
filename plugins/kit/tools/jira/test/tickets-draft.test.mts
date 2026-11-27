import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseDraftArgs } from '../cli/args.mts'
import { lintTickets, parseTickets } from '../src/draft/tickets.mts'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()
const fence = (text: string): string => `\`\`\`\n${text}\n\`\`\``
const section = (id: string, title: string, body: string): string => `## ${id}\n${fence(title)}\n${fence(body)}\n`
const DOC = ['# Стори: Пример', '', 'Пояснение не уходит в Jira.', '', section('story', 'Пример роадмапа', 'h3. Контекст\nЦель.'), section('A1', 'Первый шаг', 'h3. Объём\n* пункт'), section('B1', 'Второй шаг', 'Текст')].join('\n')

test('T1: разбор — стори и подзадачи по порядку', () => {
  const parsed = parseTickets(DOC)
  assert.ok(parsed.ok)
  assert.equal(parsed.story.title, 'Пример роадмапа')
  assert.deepEqual(parsed.children.map(child => child.id), ['A1', 'B1'])
  assert.equal(parsed.children[0].body, 'h3. Объём\n* пункт')
})

test('T2: нет story, дубль id, лишний блок — ошибки с правилами', () => {
  const noStory = parseTickets(section('A1', 'Шаг', 'Текст'))
  assert.ok(!noStory.ok && noStory.errors.some(error => error.rule === 'story-missing'))
  const duplicate = parseTickets(DOC + '\n' + section('A1', 'Ещё', 'Текст'))
  assert.ok(!duplicate.ok && duplicate.errors.some(error => error.rule === 'ticket-duplicate'))
  const broken = parseTickets(DOC.replace(fence('Второй шаг'), fence('Второй шаг') + '\nлишний текст'))
  assert.ok(!broken.ok && broken.errors.some(error => error.rule === 'outside-block'))
})

test('T3: номера строк указывают на файл', () => {
  const parsed = parseTickets(DOC)
  assert.ok(parsed.ok)
  const lines = DOC.split('\n')
  assert.equal(lines[parsed.children[0].titleLine - 1], 'Первый шаг')
  assert.equal(lines[parsed.children[0].bodyLine - 1], 'h3. Объём')
})

test('T4: lintTickets — разметка, префиксы названия, сверка с id состояния', () => {
  const bad = parseTickets(DOC.replace('Текст\n```', '- пункт\n```').replace('Первый шаг', '[а] [б] [в] Первый'))
  assert.ok(bad.ok)
  assert.deepEqual(lintTickets(bad).map(error => error.rule).sort(), ['bullet-marker', 'title-prefixes'])
  const good = parseTickets(DOC)
  assert.ok(good.ok)
  assert.deepEqual(lintTickets(good, ['A1', 'B1']), [])
  assert.deepEqual(lintTickets(good, ['A1', 'C1']).map(error => error.rule).sort(), ['ticket-missing', 'ticket-unknown'])
})

test('T5: разбор аргументов draft lint --kind tickets --state', () => {
  assert.deepEqual(parseDraftArgs(['lint', 't.md', '--kind', 'tickets', '--state', 's.json']), { action: 'lint', file: 't.md', kind: 'tickets', state: 's.json' })
  assert.throws(() => parseDraftArgs(['lint', 't.md', '--state', 's.json']))
})

test('T6: CLI — draft lint --kind tickets', async () => {
  const box = sandbox(fake)
  writeFileSync(join(box.cwd, 't.md'), DOC)
  writeFileSync(join(box.cwd, 's.json'), JSON.stringify({ steps: [{ id: 'A1' }, { id: 'B1' }] }))
  const good = await box.run(['draft', 'lint', 't.md', '--kind', 'tickets', '--state', 's.json'])
  assert.equal(good.code, 0, good.stderr)
  assert.deepEqual(JSON.parse(good.stdout), { ok: true, errors: [] })
  writeFileSync(join(box.cwd, 's.json'), JSON.stringify({ steps: [{ id: 'A1' }] }))
  const bad = await box.run(['draft', 'lint', 't.md', '--kind', 'tickets', '--state', 's.json'])
  assert.equal(bad.code, 1)
  assert.deepEqual(JSON.parse(bad.stdout).errors.map((error: { rule: string }) => error.rule), ['ticket-unknown'])
})
