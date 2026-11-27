import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyResolve, createdPath, emptyCreated, loadCreated } from '../src/roadmap/created.mts'
import { CliError } from '../src/errors.mts'

const url = (key: string): string => `http://jira/browse/${key}`

test('C1: путь результата рядом с документом', () => {
  assert.equal(createdPath('tmp/drafts/x-tickets.md'), 'tmp/drafts/x-tickets.created.json')
})

test('C2: нет файла — пусто; битый JSON — CliError', () => {
  assert.deepEqual(loadCreated('p', () => { throw new Error('нет') }), emptyCreated())
  assert.throws(() => loadCreated('p', () => '{oops'), CliError)
})

test('C3: resolve=KEY записывает тикет и снимает unknown', () => {
  const created = { ...emptyCreated(), unknown: 'A1' }
  const next = applyResolve(created, ['A1=ABC-5'], url)
  assert.deepEqual(next.children.A1, { key: 'ABC-5', url: url('ABC-5') })
  assert.equal(next.unknown, null)
})

test('C4: resolve=retry снимает unknown без записи; story=KEY пишет стори', () => {
  assert.deepEqual(applyResolve({ ...emptyCreated(), unknown: 'A1' }, ['A1=retry'], url), emptyCreated())
  const story = applyResolve({ ...emptyCreated(), unknown: 'story' }, ['story=ABC-1'], url)
  assert.deepEqual(story.story, { key: 'ABC-1', url: url('ABC-1') })
})

test('C5: resolve не для unknown, неверный формат и ключ — CliError', () => {
  assert.throws(() => applyResolve({ ...emptyCreated(), unknown: 'A1' }, ['B1=ABC-5'], url), CliError)
  assert.throws(() => applyResolve({ ...emptyCreated(), unknown: 'A1' }, ['A1=oops'], url), CliError)
  assert.throws(() => applyResolve({ ...emptyCreated(), unknown: 'A1' }, ['A1'], url), CliError)
  assert.throws(() => applyResolve(emptyCreated(), ['A1=retry'], url), CliError)
})
