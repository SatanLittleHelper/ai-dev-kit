import { expect, test } from 'claude-code/testing'

import { detectPrCreate, extractPr, isGitCommit, wantsPr } from './commands'

test('wantsPr узнаёт просьбу создать ПР', async () => {
  for (const text of [
    'сделай ПР',
    'Создай пр по задаче',
    'сделай мне PR',
    'открой pull request',
    'open a PR',
    'create a pull request',
  ]) {
    expect(wantsPr(text)).toBe(true)
  }

  for (const text of ['что такое пр', 'расскажи про процесс', 'сделай праздник', 'review the pr']) {
    expect(wantsPr(text)).toBe(false)
  }
})

test('isGitCommit узнаёт git commit и не путает с commit-tree', async () => {
  for (const command of ['git commit -m "x"', 'git add . && git commit -m x', 'git -C sub commit --amend']) {
    expect(isGitCommit(command)).toBe(true)
  }

  for (const command of ['git commit-tree abc', 'git status', 'echo hi']) {
    expect(isGitCommit(command)).toBe(false)
  }
})

test('detectPrCreate разбирает gh pr create', async () => {
  const withFile = detectPrCreate('gh pr create --base main --title "t" --body-file /tmp/b.md')
  expect(withFile?.kind).toBe('gh')
  expect(withFile?.base).toBe('main')
  expect(withFile?.file).toBe('/tmp/b.md')

  const inline = detectPrCreate('gh pr create -B dev -b "**Серьёзность: Лёгкие** — док"')
  expect(inline?.base).toBe('dev')
  expect(inline?.body).toBe('**Серьёзность: Лёгкие** — док')

  const dynamic = detectPrCreate('gh pr create --body "$(cat f)"')
  expect(dynamic?.kind).toBe('gh')
  expect(dynamic?.body).toBe(undefined)
  expect(dynamic?.file).toBe(undefined)
})

test('detectPrCreate разбирает curl POST на /pulls Forgejo', async () => {
  const withFile = detectPrCreate(
    'curl -sS -X POST "https://git.example.com/api/v1/repos/o/r/pulls" -H "Authorization: token $FORGEJO_TOKEN" -d @/tmp/pr.json',
  )
  expect(withFile?.kind).toBe('curl')
  expect(withFile?.file).toBe('/tmp/pr.json')

  const inline = detectPrCreate(
    `curl -X POST https://git.example.com/api/v1/repos/o/r/pulls -d '{"base":"main","body":"x"}'`,
  )
  expect(inline?.json).toBe('{"base":"main","body":"x"}')
})

test('detectPrCreate пропускает чтение и чужие команды', async () => {
  expect(detectPrCreate('curl -s https://git.example.com/api/v1/repos/o/r/pulls?state=open')).toBe(undefined)
  expect(detectPrCreate('gh pr list')).toBe(undefined)
})

test('extractPr достаёт body и base из JSON', async () => {
  const parsed = extractPr('{"base":"main","body":"B"}')
  expect(parsed.base).toBe('main')
  expect(parsed.body).toBe('B')
  expect(extractPr('not json').body).toBe(undefined)
  expect(extractPr('{"body":1}').body).toBe(undefined)
})
