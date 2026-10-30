import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

type Run = { exitCode: number; stdout: string; stderr: string }

const ok = (stdout: string): Run => ({ exitCode: 0, stdout, stderr: '' })
const FAIL: Run = { exitCode: 1, stdout: '', stderr: 'fatal' }

// Движок под плагином: git отвечает по таблице `аргументы → результат`, остальное не найдено.
function git(on: On, answers: Record<string, Run>): string[] {
  const calls: string[] = []

  on('process.run', (_, e) => {
    const key = e.argv.slice(1).join(' ')
    calls.push(key)

    return { value: answers[key] ?? FAIL }
  })

  return calls
}

function files(on: On, table: Record<string, string>): void {
  on('fs.read', (_, e) => {
    const text = table[e.path]

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text }
  })
}

const BODY = (level: string): string =>
  [`**Серьёзность: ${level}** — причина`, '', '## Зачем', 'x', '', '## Что сделано', '- y'].join('\n')

const DIFF = 'diff --name-status -M origin/main...HEAD'
const HEAD = 'symbolic-ref --short refs/remotes/origin/HEAD'

test('«сделай ПР» подмешивает инструкции, обычный промпт не трогает', async ($, on) => {
  const seen: { text: string; context?: readonly string[] }[] = []

  on('prompt.submit', (_, e) => {
    seen.push({ text: e.text, context: e.context })

    return { text: e.text, context: e.context }
  })

  await $.prompt.submit({ text: 'сделай ПР' })
  await $.prompt.submit({ text: 'расскажи про git' })

  expect(seen[0]?.context?.some(block => block.includes('git status --porcelain'))).toBe(true)
  expect(seen[1]?.context).toBe(undefined)
})

test('git commit в trunk блокируется, в обычной ветке проходит', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  git(on, { 'branch --show-current': ok('main\n'), [HEAD]: ok('origin/main\n') })

  const blocked = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect(blocked.deny?.includes('trunk')).toBe(true)
})

test('git commit в feature-ветке проходит', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  git(on, { 'branch --show-current': ok('PROJ-1\n'), [HEAD]: ok('origin/main\n') })

  const passed = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect(passed.deny).toBe(undefined)
})

test('default-ветка репозитория тоже считается trunk', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  git(on, { 'branch --show-current': ok('develop\n'), [HEAD]: ok('origin/develop\n') })

  const blocked = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect(blocked.deny?.includes('trunk')).toBe(true)
})

test('сбой git не блокирует коммит', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  git(on, {})

  const passed = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect(passed.deny).toBe(undefined)
})

test('gh pr create: описание проверяется по границе серьёзности', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  files(on, { '/tmp/b.md': BODY('Лёгкие') })

  git(on, { [DIFF]: ok('M\tREADME.md\n') })
  const passed = await $.tool.call({ tool: 'Bash', command: 'gh pr create --base main --body-file /tmp/b.md' })
  expect(passed.deny).toBe(undefined)
})

test('gh pr create: уровень ниже границы блокируется', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  files(on, { '/tmp/b.md': BODY('Лёгкие') })
  git(on, { [DIFF]: ok('M\tsrc/payments/x.ts\n') })

  const blocked = await $.tool.call({ tool: 'Bash', command: 'gh pr create --base main --body-file /tmp/b.md' })
  expect(blocked.deny?.includes('Критичные')).toBe(true)
})

test('gh pr create: нет файла описания или тело неопределимо', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  files(on, {})
  git(on, { [DIFF]: ok('M\tREADME.md\n') })

  const missing = await $.tool.call({ tool: 'Bash', command: 'gh pr create --base main --body-file /tmp/none.md' })
  expect(missing.deny?.includes('не найден')).toBe(true)

  const fill = await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  expect(fill.deny?.includes('--body-file')).toBe(true)
})

test('curl POST на /pulls проверяет body из JSON-файла', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  files(on, {
    '/tmp/good.json': JSON.stringify({ base: 'main', body: BODY('Лёгкие') }),
    '/tmp/bad.json': JSON.stringify({ base: 'main', body: 'без серьёзности' }),
  })
  git(on, { [DIFF]: ok('M\tREADME.md\n') })

  const command = (file: string): string =>
    `curl -sS -X POST https://h/api/v1/repos/o/r/pulls -H "Authorization: token $FORGEJO_TOKEN" -d @${file}`

  const passed = await $.tool.call({ tool: 'Bash', command: command('/tmp/good.json') })
  expect(passed.deny).toBe(undefined)

  const blocked = await $.tool.call({ tool: 'Bash', command: command('/tmp/bad.json') })
  expect(blocked.deny?.includes('Первая строка')).toBe(true)
})

test('посторонняя команда не трогает git', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const calls = git(on, {})

  const passed = await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(passed.deny).toBe(undefined)
  expect(calls.length).toBe(0)
})

test('не удалось посчитать границу: проверяется только формат', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  files(on, { '/tmp/b.md': BODY('Лёгкие') })
  git(on, {})

  const passed = await $.tool.call({ tool: 'Bash', command: 'gh pr create --base main --body-file /tmp/b.md' })
  expect(passed.deny).toBe(undefined)
})
