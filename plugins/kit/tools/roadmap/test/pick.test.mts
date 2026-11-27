import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { git, makeRepo, roadmap, write } from './support.mts'

const step = (id: string, status = 'not-started', dependsOn: string[] = []): object => ({ id, title: id, ticket: 'TBD', dependsOn, estimate: null, stepFolder: null, status, specPath: null, testPlanPath: null, planPath: null })
const state = (feature: string, steps: object[]): string => JSON.stringify({ feature, roadmapPath: '', updatedAt: 'x', steps })
const MD = '# Роадмап: X\n\n- [ ] A1 — Первый\n- [ ] B1 — Второй (depends: A1)\n'
const env = { FORGEJO_TOKEN: '' }

function repo(extra: Record<string, string> = {}): { work: string } {
  return makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': MD, 'docs/x/roadmap-state.json': state('x', [step('A1'), step('B1', 'not-started', ['A1'])]), ...extra })
}

test('K1: грязное дерево — blocked', () => {
  const { work } = repo()
  write(work, 'dirty.txt', 'x')
  assert.equal(roadmap(work, env, 'pick', 'A1', '--step-slug', 'first').json.result, 'blocked')
})

test('K2: готовый шаг — ветка от origin/main, имя по id, stepFolder заполнен, команда flow', () => {
  const { work } = repo()
  const response = roadmap(work, env, 'pick', 'A1', '--step-slug', 'first')
  assert.equal(response.json.result, 'ok', response.stdout)
  assert.equal(git(work, 'branch', '--show-current'), 'A1')
  assert.equal(response.json.base, 'origin/main')
  assert.equal(response.json.stepFolder, 'docs/x/steps/first/')
  assert.match(response.json.flow, /start A1 --step-dir docs\/x\/steps\/first --no-tracker$/)
  assert.equal(JSON.parse(readFileSync(join(work, 'docs/x/roadmap-state.json'), 'utf8')).steps[0].stepFolder, 'docs/x/steps/first/')
})

test('K3: без --step-slug и без stepFolder — needs-input, ветка не создана', () => {
  const { work } = repo()
  const response = roadmap(work, env, 'pick', 'A1')
  assert.equal(response.code, 2)
  assert.equal(git(work, 'branch', '--show-current'), 'main')
})

test('K4: заблокированный шаг — blocked с причиной', () => {
  const { work } = repo()
  const response = roadmap(work, env, 'pick', 'B1', '--step-slug', 'second')
  assert.equal(response.json.result, 'blocked')
  assert.match(response.json.reason, /A1/)
})

test('K5: чужие роадмапы прячутся sparse-checkout, коммитов с удалениями нет', () => {
  const { work } = repo({ 'docs/other/2026-01-01-other-roadmap.md': '# Роадмап: O\n\n- [ ] P1 — Шаг\n', 'docs/other/roadmap-state.json': state('other', [step('P1')]) })
  const response = roadmap(work, env, 'pick', 'A1', '--step-slug', 'first')
  assert.equal(response.json.isolation.hidden[0], 'other')
  assert.equal(existsSync(join(work, 'docs/other')), false)
  assert.equal(existsSync(join(work, 'docs/x')), true)
  assert.equal(git(work, 'status', '--porcelain').includes('other'), false)
  assert.equal(existsSync(join(work, 'tmp/roadmap/isolated.json')), true)
})

test('K6: уже настроенный пользователем sparse-checkout не трогается', () => {
  const { work } = repo({ 'docs/other/2026-01-01-other-roadmap.md': '# Роадмап: O\n\n- [ ] P1 — Шаг\n', 'docs/other/roadmap-state.json': state('other', [step('P1')]) })
  git(work, 'sparse-checkout', 'set', '--no-cone', '/*')
  const response = roadmap(work, env, 'pick', 'A1', '--step-slug', 'first')
  assert.equal(response.json.isolation, 'skipped-user-config')
  assert.equal(existsSync(join(work, 'docs/other')), true)
})

test('K7: на ветке с id шага база — текущая; при отставании от main без --sync — needs-input', () => {
  const { work } = repo()
  git(work, 'switch', '-q', '-c', 'work-A1')
  write(work, 'a.txt', 'a')
  git(work, 'add', '-A')
  git(work, 'commit', '-qm', 'a')
  git(work, 'push', '-q', 'origin', 'main')
  const peer = repo().work
  void peer
  const ahead = roadmap(work, env, 'pick', 'A1', '--step-slug', 'first', '--name', 'next-step')
  assert.equal(ahead.json.result, 'ok', ahead.stdout)
  assert.equal(ahead.json.base, 'work-A1')
})

test('K7b: отставание от main требует выбора синхронизации', () => {
  const { work, origin } = makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': MD, 'docs/x/roadmap-state.json': state('x', [step('A1'), step('B1', 'not-started', ['A1'])]) })
  git(work, 'switch', '-q', '-c', 'work-A1')
  const peer = join(dirname(work), 'peer')
  git(dirname(work), 'clone', '-q', '-b', 'main', origin, peer)
  write(peer, 'upstream.txt', 'обновление')
  git(peer, 'add', '-A')
  git(peer, 'commit', '-qm', 'upstream')
  git(peer, 'push', '-q', 'origin', 'main')
  const ask = roadmap(work, env, 'pick', 'A1', '--step-slug', 'first')
  assert.equal(ask.code, 2)
  assert.deepEqual(ask.json.options, ['merge', 'rebase', 'skip'])
  const skipped = roadmap(work, env, 'pick', 'A1', '--step-slug', 'first', '--sync', 'skip')
  assert.equal(skipped.json.result, 'ok', skipped.stdout)
})

test('K8: не совпадает с веткой — needs-input о базе; --base выбирает', () => {
  const { work } = repo()
  git(work, 'switch', '-q', '-c', 'unrelated')
  const ask = roadmap(work, env, 'pick', 'A1', '--step-slug', 'first')
  assert.equal(ask.code, 2)
  assert.equal(ask.json.options[0], 'origin/main')
  assert.equal(roadmap(work, env, 'pick', 'A1', '--step-slug', 'first', '--base', 'origin/main').json.result, 'ok')
})
