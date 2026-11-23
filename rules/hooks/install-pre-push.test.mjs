import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('./install-pre-push.sh', import.meta.url).pathname;
const START = '# >>> ai-dev-kit flow-guard >>>';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'pre-push-install-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}
const install = (cwd) => spawnSync('bash', [SCRIPT], { cwd, encoding: 'utf8' });
const hookPath = (dir) => join(dir, '.git', 'hooks', 'pre-push');
const count = (text, needle) => text.split(needle).length - 1;

test('E1 хуки I1: установка в репозиторий без pre-push', () => {
  const dir = repo();
  const result = install(dir);
  assert.equal(result.status, 0, result.stderr);
  const text = readFileSync(hookPath(dir), 'utf8');
  assert.ok(text.startsWith('#!/usr/bin/env bash\n'));
  assert.ok(text.includes(START));
  assert.ok((statSync(hookPath(dir)).mode & 0o111) !== 0);
});

test('E1 хуки I2: повторная установка идемпотентна и обновляет устаревший блок', () => {
  const dir = repo();
  assert.equal(install(dir).status, 0);
  assert.equal(install(dir).status, 0);
  assert.equal(count(readFileSync(hookPath(dir), 'utf8'), START), 1);

  writeFileSync(hookPath(dir), readFileSync(hookPath(dir), 'utf8').replace('guard push', 'OLD-CONTENT'));
  assert.equal(install(dir).status, 0);
  const text = readFileSync(hookPath(dir), 'utf8');
  assert.equal(count(text, START), 1);
  assert.ok(text.includes('guard push'));
  assert.ok(!text.includes('OLD-CONTENT'));
});

test('E1 хуки I3: чужой хук сохраняется', () => {
  const dir = repo();
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  writeFileSync(hookPath(dir), '#!/bin/bash\necho custom\n');
  chmodSync(hookPath(dir), 0o755);

  assert.equal(install(dir).status, 0);
  const text = readFileSync(hookPath(dir), 'utf8');
  assert.equal(text.split('\n')[0], '#!/bin/bash');
  assert.ok(text.includes('echo custom'));
  assert.ok(text.indexOf(START) < text.indexOf('echo custom'));
});

test('E1 хуки I3: чужая логика получает те же данные из stdin', () => {
  const dir = repo();
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  writeFileSync(hookPath(dir), '#!/bin/bash\ncat > "$(dirname "$0")/seen.txt"\n');
  chmodSync(hookPath(dir), 0o755);
  assert.equal(install(dir).status, 0);

  const line = 'refs/heads/x 1111111111111111111111111111111111111111 refs/heads/x 0000000000000000000000000000000000000000';
  for (const input of [`${line}\n`, `${line}\n\n\n`, '']) {
    const run = spawnSync('bash', [hookPath(dir)], { cwd: dir, input, encoding: 'utf8' });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(join(dir, '.git', 'hooks', 'seen.txt'), 'utf8'), input);
  }

  // Временный файл создать нельзя: stdin остаётся нетронутым, проверка пропускается.
  const noTemp = spawnSync('bash', [hookPath(dir)], { cwd: dir, input: `${line}\n`, encoding: 'utf8', env: { ...process.env, TMPDIR: '/nonexistent-dir' } });
  assert.equal(noTemp.status, 0, noTemp.stderr);
  assert.equal(readFileSync(join(dir, '.git', 'hooks', 'seen.txt'), 'utf8'), `${line}\n`);
});

test('E1 хуки I4: хук не на shell не трогается', () => {
  const dir = repo();
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  const original = '#!/usr/bin/env node\nconsole.log("x")\n';
  writeFileSync(hookPath(dir), original);

  const result = install(dir);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /not a shell script/);
  assert.equal(readFileSync(hookPath(dir), 'utf8'), original);
});

test('E1 хуки I5: учитывается core.hooksPath', () => {
  const dir = repo();
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir });

  assert.equal(install(dir).status, 0);
  assert.ok(existsSync(join(dir, '.githooks', 'pre-push')));
  assert.equal(existsSync(hookPath(dir)), false);
});
