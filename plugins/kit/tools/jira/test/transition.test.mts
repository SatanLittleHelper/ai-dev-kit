import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sandbox, useFakeJira } from './support.mts'

const fake = useFakeJira()
const KEY = 'ABC-42'

function issue(status = 'Open', key = KEY): void {
  fake.state.issues.push({ key, project: 'ABC', type: 'Task', summary: 'Задача', description: '', status })
}

async function transition({ flags = [], jira = {} }: { flags?: string[]; jira?: Record<string, unknown> } = {}) {
  return sandbox(fake, { jira }).run(['transition', KEY, ...flags])
}

function result(response: Awaited<ReturnType<typeof transition>>, status: string, issueStatus: string): void {
  assert.equal(response.code, 0, response.stderr)
  assert.deepEqual(JSON.parse(response.stdout), { key: KEY, url: `${fake.url}/browse/${KEY}`, status, issueStatus })
}

function failure(response: Awaited<ReturnType<typeof transition>>, code: number, reason: RegExp): void {
  assert.equal(response.code, code, response.stderr)
  assert.match(response.stderr, reason)
  assert.equal(response.stdout, '')
}

for (const layout of ['classic', 'classic-overflow', 'menu'] as const) {
  test(`C1 E1: ${layout}, переход подтверждается повторным GET`, async () => {
    issue()
    fake.state.transitionLayout = layout
    if (layout === 'menu') {
      fake.state.transitionOptions = [
        { label: 'test', destination: 'В работе' },
        { label: 'In Progress', destination: 'Pause' },
      ]
    }
    result(await transition(), 'transitioned', layout === 'menu' ? 'В работе' : 'In Progress')
    assert.equal(fake.state.transitions, 1)
    assert.ok(fake.state.issueReads >= 2)
  })

  test(`C1 E8: ${layout}, отсутствующее действие не запускается`, async () => {
    issue()
    fake.state.transitionLayout = layout
    fake.state.transitionOptions = []
    failure(await transition(), 3, /Переход.*не найден/i)
    assert.equal(fake.state.transitions, 0)
  })

  test(`C1 E8: ${layout}, неоднозначное действие не запускается`, async () => {
    issue()
    fake.state.transitionLayout = layout
    fake.state.transitionOptions.push({ label: 'In Progress', destination: 'In Progress' })
    failure(await transition(), 1, /несколько/i)
    assert.equal(fake.state.transitions, 0)
  })
}

test('C1 E2: уже выставленный статус не вызывает переход', async () => {
  issue('In Progress')
  result(await transition(), 'already-in-progress', 'In Progress')
  assert.equal(fake.state.transitions, 0)
})

for (const status of ['Open', 'In Progress']) {
  for (const [mode, options] of [
    ['флаг', { flags: ['--dry-run'] }],
    ['конфиг', { jira: { dryRun: true } }],
  ] as const) {
    test(`C1 E3: ${mode}, пробный переход сохраняет статус ${status}`, async () => {
      issue(status)
      result(await transition({ ...options, ...('flags' in options ? { flags: [...options.flags] } : {}) }), 'dry-run', status)
      assert.equal(fake.state.transitions, 0)
    })
  }
}

test('C1 E4: явный реальный переход важнее пробного режима в настройках', async () => {
  issue()
  result(await transition({ jira: { dryRun: true }, flags: ['--no-dry-run'] }), 'transitioned', 'In Progress')
  assert.equal(fake.state.transitions, 1)
})

test('C1 E5: название действия и ожидаемый статус задаются отдельно', async () => {
  issue()
  fake.state.transitionOptions = [
    { label: 'Начать', destination: 'В процессе' },
    { label: 'Взять', destination: 'В процессе' },
  ]
  result(await transition({ jira: { inProgressTransition: 'Начать', inProgressStatus: 'В процессе' } }), 'transitioned', 'В процессе')
  assert.equal(fake.state.transitions, 1)
})

test('C1 E5: стандартное действие не подходит для настроенного целевого статуса', async () => {
  issue()
  fake.state.transitionLayout = 'classic'
  failure(await transition({ jira: { inProgressStatus: 'В процессе' } }), 3, /Переход.*не найден/i)
  assert.equal(fake.state.transitions, 0)
})

test('C1 E5: имя действия без метки статуса требует явной настройки', async () => {
  issue()
  fake.state.transitionLayout = 'classic'
  fake.state.transitionOptions = [{ label: 'Start Progress', destination: 'In Progress' }]
  failure(await transition(), 3, /Переход.*не найден/i)
  assert.equal(fake.state.transitions, 0)
  result(await transition({ jira: { inProgressTransition: 'Start Progress' } }), 'transitioned', 'In Progress')
})

test('C1 E6: перенаправление на вход возвращает код неактивной сессии', async () => {
  issue()
  fake.state.loggedIn = false
  failure(await transition(), 2, /jira login/)
  assert.equal(fake.state.transitions, 0)
})

test('C1 E7: отсутствующая карточка не открывает переход', async () => {
  failure(await transition(), 3, /ABC-42/)
  assert.equal(fake.state.transitions, 0)
})

test('C1 E7: переадресация на другую карточку блокирует переход', async () => {
  issue()
  issue('Open', 'ABC-43')
  fake.state.redirectIssue = true
  failure(await transition(), 3, /ABC-42/)
  assert.equal(fake.state.transitions, 0)
})

for (const mode of ['rejected', 'unchanged', 'redirect-after'] as const) {
  test(`C1 E9: ${mode}, неподтверждённый результат не выдаётся за успех`, async () => {
    issue()
    issue('In Progress', 'ABC-43')
    fake.state.transitionMode = mode
    failure(await transition(), 5, /подтвердить|отклонила/i)
    assert.equal(fake.state.transitions, 1)
  })
}
