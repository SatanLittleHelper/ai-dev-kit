import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDashboard } from '../src/dashboard.mts'
import type { ListRow } from '../src/status.mts'

const row = (over: Partial<ListRow> = {}): ListRow => ({
  number: 1, title: 'Заголовок', author: 'bob', isOwn: false, headRef: 'feat', scenario: 'review', status: 'на проверке',
  conflicted: false, ci: 'success', failedChecks: [], url: 'https://git.example.org/o/r/pulls/1', activity: '5 мин',
  baseRef: 'main', approvals: 0, stackParent: null, ...over,
})

test('R1: строка таблицы: ссылка, статус, CI, одобрения, ветка, автор, активность', () => {
  const text = renderDashboard({ due: [row()], waiting: [], truncated: false })
  assert.equal(text, [
    'Требует вашего действия (1)', '',
    '| PR | Статус | CI | Одобрения | Ветка | Автор | Заголовок | Активность |',
    '|---|---|---|---|---|---|---|---|',
    '| [#1](https://git.example.org/o/r/pulls/1) | 👀 на проверке | ✅ | — | `feat` → `main` | bob | Заголовок | 5 мин |',
  ].join('\n'))
})

test('R2: свой PR, конфликт, стек, одобрения и пустая активность', () => {
  const text = renderDashboard({ due: [], waiting: [row({ isOwn: true, status: 'готов к слиянию', conflicted: true, stackParent: 7, approvals: 2, activity: '' })], truncated: false })
  assert.match(text, /\| ✅ готов к слиянию \(мой\) · конфликт · после #7 \| ✅ \| 2 ✅ \| `feat` → `main` \| вы \| Заголовок \| — \|/)
  assert.ok(text.startsWith('Ждёт других (1)'))
})

test('R3: упавшие проверки — одна строка под таблицей группы', () => {
  const failed = { ci: 'failure' as const, failedChecks: ['build', 'lint'] }
  const text = renderDashboard({ due: [row({ number: 1, ...failed }), row({ number: 2, ...failed, failedChecks: ['test'] }), row({ number: 3 })], waiting: [], truncated: false })
  assert.match(text, /\n\nУпавшие проверки: #1 — build, lint; #2 — test$/)
})

test('R4: пустой дашборд и усечение', () => {
  assert.equal(renderDashboard({ due: [], waiting: [], truncated: false }), 'Открытых PR нет.')
  assert.match(renderDashboard({ due: [], waiting: [], truncated: true }), /\n\nПрочитано 50 открытых PR/)
})

test('R5: «|» и перевод строки в заголовке не ломают таблицу', () => {
  const text = renderDashboard({ due: [row({ title: 'a | b\nc' })], waiting: [], truncated: false })
  assert.match(text, /\| a \\\| b c \|/)
})
