import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

test('установленная копия использует общий клиент и проверяет тело до POST', t => {
  const root = mkdtempSync(join(tmpdir(), 'codex-forgejo-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const plugin = join(root, 'installed plugin')
  cpSync('plugins/pr-flow-codex', plugin, { recursive: true })
  const cwd = join(root, 'repo')
  const bin = join(root, 'bin')
  mkdirSync(cwd)
  mkdirSync(bin)
  const log = join(root, 'requests.jsonl')
  writeFileSync(join(bin, 'git'), `#!/bin/sh
case "$*" in
  "remote get-url origin") echo "http://127.0.0.1:12345/team/app.git" ;;
  "diff --name-status -M origin/main...HEAD") printf "M\\tREADME.md\\n" ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 })
  const fixture = join(root, 'fetch.mjs')
  writeFileSync(fixture, `import { appendFileSync } from 'node:fs'
globalThis.fetch = async (url, init) => {
  const body = init.body === undefined ? undefined : JSON.parse(init.body)
  appendFileSync(process.env.PR_FLOW_TEST_LOG, JSON.stringify({url, method: init.method, body, redirect: init.redirect}) + '\\n')
  return Response.json(init.method === 'GET' ? [] : {
    number: 12, html_url: 'http://127.0.0.1:12345/team/app/pulls/12',
  })
}
`)
  const run = (...args) => spawnSync(process.execPath, ['--import', fixture, join(plugin, 'forgejo.mts'), 'pr', ...args], {
    cwd, encoding: 'utf8', env: {
      ...process.env, PATH: bin + ':' + process.env.PATH,
      PR_FLOW_TEST_LOG: log, FORGEJO_TOKEN: '', GITEA_TOKEN: 'fixture-token',
    },
  })
  const calls = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : []
  const found = run('find', '--head', 'topic')
  assert.equal(found.status, 0, found.stderr)
  assert.equal(JSON.parse(found.stdout), null)
  assert.equal(calls()[0].method, 'GET')

  const draft = { base: 'main', head: 'topic', title: 'Документация', body: 'без шаблона' }
  const file = join(cwd, 'draft.json')
  writeFileSync(file, JSON.stringify(draft))
  const bad = run('create', '--file', file, '--confirm')
  assert.equal(bad.status, 2, bad.stderr)
  assert.match(bad.stderr, /Первая строка описания/)
  assert.equal(calls().length, 1)

  draft.body = '🟢 **Серьёзность: Лёгкие** — документация\n\n## Что сделано\n- Обновлён README\n'
  writeFileSync(file, JSON.stringify(draft))
  const published = run('create', '--file', file, '--confirm')
  assert.equal(published.status, 0, published.stderr)
  assert.deepEqual(JSON.parse(published.stdout), { number: 12, url: 'http://127.0.0.1:12345/team/app/pulls/12' })
  assert.deepEqual(calls().slice(1), [{
    url: 'http://127.0.0.1:12345/api/v1/repos/team/app/pulls',
    method: 'POST', body: draft, redirect: 'error',
  }])
})
