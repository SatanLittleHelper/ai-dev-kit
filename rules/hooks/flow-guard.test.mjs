import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KIT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const WRAPPER = new URL('./flow-guard.js', import.meta.url).pathname;
const FLOW = join(KIT, 'plugins/kit/tools/flow/cli/main.mts');

function project({ kit = KIT, task = true, branch = 'task-flow-f1' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'flow-guard-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['symbolic-ref', 'HEAD', `refs/heads/${branch}`], { cwd: dir });
  if (kit) {
    mkdirSync(join(dir, '.claude'));
    symlinkSync(kit, join(dir, '.claude', 'ai-dev-kit'));
  }
  if (task) spawnSync(process.execPath, [FLOW, 'start', 'F1', '--no-tracker'], { cwd: dir });
  return dir;
}

function fakeKit(script) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-kit-'));
  const cli = join(dir, 'plugins/kit/tools/flow/cli');
  mkdirSync(cli, { recursive: true });
  writeFileSync(join(cli, 'main.mts'), script);
  return dir;
}

function hook(cwd, event) {
  const run = spawnSync(process.execPath, [WRAPPER], { cwd, input: JSON.stringify({ cwd, ...event }), encoding: 'utf8' });
  assert.equal(run.status, 0, 'хук flow-guard должен запускаться');
  return { code: run.status, stdout: run.stdout.trim() };
}

const push = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push origin task-flow-f1' } };

test('E1 хуки U18: SessionStart выдаёт контекст', () => {
  const { code, stdout } = hook(project(), { hook_event_name: 'SessionStart' });
  assert.equal(code, 0);
  assert.match(JSON.parse(stdout).hookSpecificOutput.additionalContext, /Задача F1/);
});

test('E1 хуки U19: Stop отказывается заканчивать ход', () => {
  const answer = JSON.parse(hook(project(), { hook_event_name: 'Stop' }).stdout);
  assert.equal(answer.decision, 'block');
  assert.match(answer.reason, /flow status/);
});

test('E1 хуки U20: Stop с признаком повторной остановки молчит', () => {
  const { code, stdout } = hook(project(), { hook_event_name: 'Stop', stop_hook_active: true });
  assert.deepEqual([code, stdout], [0, '']);
});

test('E1 хуки U21: git push блокируется по отправляемой ветке до закрытия стадий', () => {
  const cases = [
    ['task-flow-f1', 'git push origin task-flow-f1'],
    ['main', 'git push origin task-flow-f1'],
    ['main', 'git push origin HEAD:refs/heads/task-flow-f1'],
  ];
  for (const [branch, command] of cases) {
    const output = JSON.parse(hook(project({ branch }), { ...push, tool_input: { command } }).stdout).hookSpecificOutput;
    assert.equal(output.permissionDecision, 'deny', `${branch}: ${command}`);
    assert.match(output.permissionDecisionReason, /simplify/);
  }

  assert.equal(hook(project(), { ...push, tool_input: { command: 'git push origin other' } }).stdout, '');
});

test('E1 хуки U22: создание PR блокируется, включая запуск через rtk', () => {
  const dir = project();
  const commands = [
    'gh pr create --title x',
    'rtk git push',
    'git --git-dir=.git push',
    'node "/p/.claude/ai-dev-kit/plugins/kit/tools/forgejo/cli/main.mts" pr create --file d.json',
    'curl -sS -X POST "https://host/api/v1/repos/o/r/pulls" -d @d.json',
  ];
  for (const command of commands) {
    const output = JSON.parse(hook(dir, { ...push, tool_input: { command } }).stdout).hookSpecificOutput;
    assert.equal(output.permissionDecision, 'deny', command);
  }
});

test('E1 хуки U23: посторонние команды не блокируются', () => {
  const dir = project();
  for (const command of ['git status', 'git commit -m "fix push logic"', 'echo "git push"', 'echo "x git push"', 'echo "curl -X POST https://host/api/v1/repos/o/r/pulls"', 'git commit -m "run gh pr create"']) {
    assert.equal(hook(dir, { ...push, tool_input: { command } }).stdout, '', command);
  }
});

test('E1 хуки U24: без flow в проекте обёртка молчит', () => {
  const dir = project({ kit: null, task: false });
  for (const event of [{ hook_event_name: 'SessionStart' }, { hook_event_name: 'Stop' }, push]) {
    assert.deepEqual(hook(dir, event), { code: 0, stdout: '' });
  }
});

test('E1 хуки U25: сбой CLI не блокирует', () => {
  const incompatible = "console.log(JSON.stringify({ result: 'guard', decision: 'deny', message: 'x' }))";
  for (const script of ["console.log('мусор')", 'process.exit(1)', incompatible]) {
    const dir = project({ kit: fakeKit(script), task: false });
    for (const event of [{ hook_event_name: 'Stop' }, push]) {
      assert.deepEqual(hook(dir, event), { code: 0, stdout: '' }, script);
    }
  }
});
