import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { parseRoadmap } from '../src/parse.mts'
import { buildTickets } from '../src/tickets.mts'
import { makeRepo, roadmap, ROADMAP } from './support.mts'

test('TK1: документ тикетов — стори из контекста, подзадачи из шагов', () => {
  const text = buildTickets(parseRoadmap(ROADMAP))
  assert.match(text, /^# Стори: Пример/)
  assert.match(text, /## story\n```\nПример\n```\n```\nh3\. Контекст\nНужно разложить большую задачу на шаги\.\n```/)
  assert.match(text, /## A1\n```\nПервый шаг\n```\n```\nh3\. Объём\nсделать первое\.\n\nh3\. Готово, когда\nпервое работает\.\n```/)
})

test('TK2: команда tickets пишет tmp/drafts/<slug>-tickets.md', () => {
  const { work } = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': ROADMAP })
  const response = roadmap(work, {}, 'tickets', 'x')
  assert.equal(response.json.result, 'ok', response.stdout)
  assert.equal(response.json.path, 'tmp/drafts/x-tickets.md')
  assert.match(readFileSync(join(work, 'tmp/drafts/x-tickets.md'), 'utf8'), /## B1/)
})
