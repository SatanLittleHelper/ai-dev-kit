import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const plugin = resolve('plugins/pr-flow-codex')
const node = process.execPath
const temp = []
import { after } from 'node:test'
after(() => { for (const dir of temp) rmSync(dir, { recursive: true, force: true }) })
const good = '🟢 **Серьёзность: Лёгкие** — документация\n\n## Что сделано\n- Обновлено\n'
function fixture({ branch = 'feature', head = 'origin/main', files = 'M\tREADME.md', fail = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-flow test ')), bin = join(dir, 'bin')
  temp.push(dir)
  mkdirSync(bin)
  const git = join(bin, 'git')
  writeFileSync(git, `#!/bin/sh\nprintf '%s\\n' "$*" >> "$PR_GIT_CALLS"\ncase "$*" in\n  "branch --show-current") [ -n "$PR_BRANCH" ] || exit 1; printf '%s' "$PR_BRANCH";;\n  "symbolic-ref --short refs/remotes/origin/HEAD") printf '%s' "$PR_HEAD";;\n  "diff --name-status -M "*) [ "$PR_FAIL" != names ] || exit 1; printf '%s' "$PR_FILES";;\n  *migrations*) [ "$PR_FAIL" != migration ] || exit 1;;\n  *package.json*) [ "$PR_FAIL" != package ] || exit 1;;\n  *) exit 1;;\nesac\n`)
  chmodSync(git, 0o755)
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PR_BRANCH: branch, PR_HEAD: head, PR_FILES: files, PR_FAIL: fail, PR_GIT_CALLS: join(dir, "git.calls") }
  const run = (event, root = plugin, runtimeEnv = env) => {
    const out = spawnSync(node, [join(root, 'hooks/codex.mts')], { cwd: dir, env: runtimeEnv, input: JSON.stringify({ cwd: dir, ...event }), encoding: 'utf8' })
    assert.equal(out.status, 0, out.stderr)
    return JSON.parse(out.stdout)
  }
  const bash = command => run({ hook_event_name: 'PreToolUse', tool_input: { command } })
  return { dir, env, run, bash }
}
const denied = x => x.hookSpecificOutput?.permissionDecision === 'deny'
const reason = x => x.hookSpecificOutput?.permissionDecisionReason ?? ''
test('U1–U2: запрос PR получает путь к навыку, другой запрос — нет', () => {
  const f = fixture()
  assert.match(f.run({ hook_event_name: 'UserPromptSubmit', prompt: 'сделай ПР' }).hookSpecificOutput.additionalContext, /git status --porcelain/)
  assert.deepEqual(f.run({ hook_event_name: 'UserPromptSubmit', prompt: 'расскажи про git' }), {})
})
test('U3–U6: защита trunk и мягкий сбой git', () => {
  assert.ok(denied(fixture({ branch: 'main' }).bash('rtk git commit -m x')))
  assert.ok(denied(fixture({ branch: 'develop', head: 'origin/develop' }).bash('git commit -m x')))
  assert.ok(!denied(fixture().bash('git commit -m x')))
  assert.ok(!denied(fixture({ branch: '' }).bash('git commit -m x')))
})
test('U7–U10, U13: проверка GitHub и неполной оценки', () => {
  let f = fixture(); writeFileSync(join(f.dir, 'body.md'), good)
  assert.ok(!denied(f.bash('gh pr create --base main --body-file body.md')))
  f = fixture({ files: 'M\tsrc/payments/x.ts' }); writeFileSync(join(f.dir, 'body.md'), good)
  assert.match(reason(f.bash('gh pr create --base main --body-file body.md')), /Критичные/)
  assert.match(reason(f.bash('gh pr create --body-file absent.md')), /не найден/)
  assert.match(reason(f.bash('gh pr create --fill')), /определить/)
  f = fixture({ fail: 'names' }); writeFileSync(join(f.dir, 'body.md'), 'некорректно')
  assert.match(reason(f.bash('gh pr create --base main --body-file body.md')), /Первая строка/)
})
test('U11–U12: тело Forgejo читается из JSON', () => {
  const f = fixture(), cmd = 'curl -X POST https://git.example/api/v1/repos/o/r/pulls -d @pr.json'
  writeFileSync(join(f.dir, 'pr.json'), JSON.stringify({ base: 'main', body: 'плохо' }))
  assert.ok(denied(f.bash(cmd)))
  writeFileSync(join(f.dir, 'pr.json'), JSON.stringify({ base: 'main', body: good }))
  assert.ok(!denied(f.bash(cmd)))
})
test('U14: посторонняя команда проходит', () => {
  const f = fixture()
  assert.deepEqual(f.bash('ls -la'), {})
  assert.equal(existsSync(join(f.dir, 'git.calls')), false)
})
test('U15: установленная копия работает из пути с пробелами', () => {
  const f = fixture(), copy = join(f.dir, 'installed plugin'); cpSync(plugin, copy, { recursive: true })
  const repo = join(f.dir, 'repo')
  mkdirSync(repo)
  assert.equal(spawnSync('git', ['init', '-b', 'main'], { cwd: repo }).status, 0)
  const out = f.run({ hook_event_name: 'PreToolUse', cwd: repo, tool_input: { command: 'git commit -m x' } }, copy, process.env)
  assert.ok(denied(out))
  assert.ok(f.run({ hook_event_name: 'UserPromptSubmit', prompt: 'сделай ПР' }, copy)
    .hookSpecificOutput.additionalContext.includes(join(copy, 'skills/pr-flow/SKILL.md')))
})
test('U20: неполный diff блокирует PR и сообщает причину', () => {
  for (const [fail, files] of [['names', 'M\tREADME.md'], ['migration', 'M\tdb/migrations/1.sql'], ['package', 'M\tpackage.json']]) {
    const f = fixture({ fail, files }); writeFileSync(join(f.dir, 'body.md'), good)
    assert.match(reason(f.bash('gh pr create --base main --body-file body.md')), /Не удалось/)
  }
})
test('U21: диагностика без доступного Node', () => {
  const f = fixture()
  const out = spawnSync('/bin/sh', [join(plugin, 'hooks/validate.sh'), 'main', 'body.md'], {
    env: { PATH: f.dir }, encoding: 'utf8',
  })
  assert.equal(out.status, 2)
  assert.match(out.stderr, /Node.js 24/)
  const copied = join(f.dir, 'partial plugin')
  cpSync(join(plugin, 'hooks'), copied, { recursive: true })
  for (const name of ['cli.mts', 'shared/body.ts']) {
    rmSync(join(copied, name))
    const missing = spawnSync('/bin/sh', [join(copied, 'validate.sh'), 'main', 'body.md'], {
      env: f.env, encoding: 'utf8',
    })
    assert.equal(missing.status, 2)
    assert.match(missing.stderr, /файл проверки недоступен/)
    cpSync(join(plugin, 'hooks', name), join(copied, name))
  }
})
test('U22: явная проверка тела без хука', () => {
  const f = fixture()
  const path = join(f.dir, 'body.md')
  const run = (env = f.env) => spawnSync('/bin/sh', [
    join(plugin, 'hooks/validate.sh'), 'main', path,
  ], { cwd: f.dir, env, encoding: 'utf8' })
  writeFileSync(path, 'плохо')
  assert.equal(run().status, 1)
  writeFileSync(path, good)
  const log = join(f.dir, 'git.calls')
  writeFileSync(log, '')
  assert.equal(run().status, 0)
  assert.equal(readFileSync(log, 'utf8').trim(), 'diff --name-status -M origin/main...HEAD')
  writeFileSync(log, '')
  const remoteHead = spawnSync('/bin/sh', [join(plugin, 'hooks/validate.sh'), 'origin/main', path], { cwd: f.dir, env: f.env })
  assert.equal(remoteHead.status, 0)
  assert.equal(readFileSync(log, 'utf8').trim(), 'diff --name-status -M origin/main...HEAD')
  const secret = 'fixture-forgejo-secret'
  for (const [fail, files] of [['names', 'M\tREADME.md'], ['migration', 'M\tdb/migrations/1.sql'], ['package', 'M\tpackage.json']]) {
    const out = run({ ...f.env, PR_FAIL: fail, PR_FILES: files, FORGEJO_TOKEN: secret })
    assert.equal(out.status, 2)
    assert.match(out.stderr, /Не удалось/)
    assert.ok(!(out.stdout + out.stderr).includes(secret))
    writeFileSync(path, 'плохо')
    const invalid = run({ ...f.env, PR_FAIL: fail, PR_FILES: files })
    assert.equal(invalid.status, 1)
    assert.match(invalid.stderr, /Первая строка.*Не удалось/)
    writeFileSync(path, good)
  }
})
