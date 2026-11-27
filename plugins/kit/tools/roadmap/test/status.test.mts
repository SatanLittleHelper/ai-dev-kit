import assert from 'node:assert/strict'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { git, makeRepo, roadmap, tempDir, write } from './support.mts'

const state = (steps: object[]): string => JSON.stringify({ feature: 'x', roadmapPath: 'docs/x/2026-01-01-x-roadmap.md', updatedAt: 'x', steps })
const step = (id: string, status = 'not-started', dependsOn: string[] = []): object => ({ id, title: id, ticket: 'TBD', dependsOn, estimate: null, stepFolder: null, status, specPath: null, testPlanPath: null, planPath: null })
const MD = '# Роадмап: X\n\n- [ ] A1 — Первый\n- [ ] B1 — Второй (depends: A1)\n- [ ] C1 — Третий\n'

// Заглушка Forgejo CLI: pr list → список из файла, pr files N → файлы из файла.
function stub(prs: object[]): NodeJS.ProcessEnv {
  const dir = tempDir()
  const file = join(dir, 'cli.mjs')
  writeFileSync(file, `const prs = ${JSON.stringify(prs)}\nconst [group, action, number] = process.argv.slice(2)\nif (action === 'list') console.log(JSON.stringify(prs.map(({ files, ...rest }) => rest)))\nelse console.log(JSON.stringify(prs.find(pr => String(pr.number) === number).files))\n`)
  chmodSync(file, 0o755)
  return { ROADMAP_FORGEJO_CLI: file, FORGEJO_TOKEN: 'x' }
}

function repo(): { work: string } {
  return makeRepo({ 'docs/x/2026-01-01-x-roadmap.md': MD, 'docs/x/roadmap-state.json': state([step('A1'), step('B1', 'not-started', ['A1']), step('C1')]) })
}

const byId = (response: { json: { roadmaps: { slug: string; steps: { id: string; state: string }[] }[] } }): Record<string, string> =>
  Object.fromEntries(response.json.roadmaps[0].steps.map(item => [item.id, item.state]))

test('S1: готов / заблокирован зависимостью', () => {
  const { work } = repo()
  const response = roadmap(work, { ...stub([]) }, 'status', 'x')
  assert.equal(response.json.result, 'ok', response.stdout)
  assert.deepEqual(byId(response), { A1: 'ready', B1: 'blocked', C1: 'ready' })
  assert.deepEqual(response.json.roadmaps[0].steps[1].waitingFor, [{ id: 'A1' }])
  assert.equal(response.json.prSync, 'ok')
})

test('S2: шаг в открытом PR — in-flight, зависимый от него остаётся blocked с номером PR', () => {
  const { work } = repo()
  git(work, 'switch', '-q', '-c', 'feature-a1')
  write(work, 'docs/x/roadmap-state.json', state([step('A1', 'plan-drafted'), step('B1', 'not-started', ['A1']), step('C1')]))
  git(work, 'commit', '-qam', 'a1')
  git(work, 'push', '-q', 'origin', 'feature-a1')
  git(work, 'switch', '-q', 'main')
  const env = stub([{ number: 7, title: 'A1', headRef: 'feature-a1', baseRef: 'main', url: 'http://pr/7', files: ['docs/x/roadmap-state.json'] }])
  const response = roadmap(work, env, 'status', 'x')
  assert.deepEqual(byId(response), { A1: 'in-flight', B1: 'blocked', C1: 'ready' })
  assert.equal(response.json.roadmaps[0].steps[0].pr.number, 7)
  assert.deepEqual(response.json.roadmaps[0].steps[1].waitingFor, [{ id: 'A1', pr: 7 }])
})

test('S3: блокер закрыт в открытом PR — stackable с базой headRef', () => {
  const { work } = repo()
  git(work, 'switch', '-q', '-c', 'feature-a1')
  write(work, 'docs/x/roadmap-state.json', state([step('A1', 'closed'), step('B1', 'not-started', ['A1']), step('C1')]))
  git(work, 'commit', '-qam', 'a1')
  git(work, 'push', '-q', 'origin', 'feature-a1')
  git(work, 'switch', '-q', 'main')
  const env = stub([{ number: 7, title: 'A1', headRef: 'feature-a1', baseRef: 'main', url: 'u', files: ['docs/x/roadmap-state.json'] }])
  const response = roadmap(work, env, 'status', 'x')
  assert.equal(byId(response).B1, 'stackable')
  assert.deepEqual(response.json.roadmaps[0].steps[1].base, { headRef: 'feature-a1', pr: 7 })
})

test('S4: PR без изменения state-файла игнорируется', () => {
  const { work } = repo()
  const env = stub([{ number: 9, title: 'docs', headRef: 'x', baseRef: 'main', url: 'u', files: ['README.md'] }])
  assert.deepEqual(byId(roadmap(work, env, 'status', 'x')), { A1: 'ready', B1: 'blocked', C1: 'ready' })
})

test('S5: нет токена — prSync skipped с причиной, шаги всё равно показаны', () => {
  const { work } = repo()
  const response = roadmap(work, { FORGEJO_TOKEN: '', GITEA_TOKEN: '' }, 'status', 'x')
  assert.equal(response.json.prSync, 'skipped')
  assert.match(response.json.prSyncReason, /FORGEJO_TOKEN/)
  assert.equal(byId(response).A1, 'ready')
})

test('S6: данные берутся из origin/<default>, а не из отставшей локальной копии', () => {
  const { work } = repo()
  write(work, 'docs/x/roadmap-state.json', state([step('A1', 'closed'), step('B1', 'not-started', ['A1']), step('C1')]))
  git(work, 'commit', '-qam', 'close a1')
  git(work, 'push', '-q', 'origin', 'main')
  git(work, 'reset', '-q', '--hard', 'HEAD~1')
  const response = roadmap(work, { ...stub([]) }, 'status', 'x')
  assert.equal(byId(response).B1, 'ready')
})

test('S7: межроадмапная зависимость — нет папки: выполнена; нет шага в состоянии: broken', () => {
  const md = '# Роадмап: X\n\n- [ ] A1 — Первый (depends: gone:Z1)\n- [ ] B1 — Второй (depends: other:Q1)\n'
  const { work } = makeRepo({
    'docs/x/2026-01-01-x-roadmap.md': md,
    'docs/x/roadmap-state.json': state([step('A1', 'not-started', ['gone:Z1']), step('B1', 'not-started', ['other:Q1'])]),
    'docs/other/2026-01-01-other-roadmap.md': '# Роадмап: O\n\n- [ ] P1 — Шаг\n',
    'docs/other/roadmap-state.json': JSON.stringify({ feature: 'other', roadmapPath: '', updatedAt: 'x', steps: [step('P1')] }),
  })
  const response = roadmap(work, { ...stub([]) }, 'status', 'x')
  assert.deepEqual(byId(response), { A1: 'ready', B1: 'blocked' })
  assert.deepEqual(response.json.roadmaps[0].steps[1].waitingFor, [{ id: 'Q1', roadmap: 'other', reason: 'broken' }])
})
