import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KIT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const INSTALL = new URL('./install-pre-push.sh', import.meta.url).pathname;
const FLOW = join(KIT, 'plugins/kit/tools/flow/cli/main.mts');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
const flow = (cwd, ...args) => spawnSync(process.execPath, [FLOW, ...args], { cwd, encoding: 'utf8' });

test('E1 хуки E1: настоящий git push блокируется и затем проходит', () => {
  const remote = mkdtempSync(join(tmpdir(), 'pre-push-remote-'));
  git(remote, 'init', '-q', '--bare');

  const dir = mkdtempSync(join(tmpdir(), 'pre-push-e2e-'));
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(join(dir, '.claude'));
  symlinkSync(KIT, join(dir, '.claude', 'ai-dev-kit'));
  writeFileSync(join(dir, 'a.txt'), 'a');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'init');
  git(dir, 'remote', 'add', 'origin', remote);
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(dir, '.git', 'hooks', 'pre-push'), '#!/bin/sh -e\ntrue\n');
  chmodSync(join(dir, '.git', 'hooks', 'pre-push'), 0o755);
  assert.equal(spawnSync('bash', [INSTALL], { cwd: dir, encoding: 'utf8' }).status, 0);
  git(dir, 'branch', 'task-flow-f1');
  assert.equal(flow(dir, 'start', 'F1', '--no-tracker').status, 0);

  // Текущая ветка main без задачи: проверяется отправляемая ветка, а не текущая.
  const blocked = git(dir, 'push', 'origin', 'task-flow-f1');
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /simplify/);
  assert.match(blocked.stderr, /flow status/);

  const viaHead = git(dir, 'push', 'origin', 'HEAD:refs/heads/task-flow-f1');
  assert.notEqual(viaHead.status, 0);
  assert.match(viaHead.stderr, /simplify/);

  for (const stage of ['spec', 'test-plan', 'plan', 'implement', 'simplify', 'check', 'local-test', 'review']) {
    assert.equal(flow(dir, 'skip', stage, '--reason', 'проверка хука').status, 0, stage);
  }
  const allowed = git(dir, 'push', 'origin', 'task-flow-f1');
  assert.equal(allowed.status, 0, allowed.stderr);

  git(dir, 'checkout', '-q', '-b', 'other');
  const other = git(dir, 'push', 'origin', 'other');
  assert.equal(other.status, 0, other.stderr);
});
