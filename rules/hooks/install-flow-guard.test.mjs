import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('./install-flow-guard.sh', import.meta.url).pathname;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'flow-guard-install-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}
const install = (cwd, ...args) => spawnSync('bash', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
const read = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
const entries = (json, event) => (json.hooks[event] || []).filter((entry) => entry.hooks.some((hook) => hook.command.includes('flow-guard.js')));

test('E1 хуки I6: хуки Claude регистрируются в .claude/settings.json, чужое сохраняется', () => {
  const dir = repo();
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo other' }] }] } }));

  assert.equal(install(dir).status, 0);
  assert.equal(install(dir).status, 0);

  const settings = read(dir, '.claude/settings.json');
  assert.deepEqual(settings.permissions, { allow: ['Bash(ls)'] });
  assert.equal(settings.hooks.PreToolUse.length, 2);
  for (const event of ['SessionStart', 'Stop', 'PreToolUse']) assert.equal(entries(settings, event).length, 1, event);
  assert.equal(entries(settings, 'PreToolUse')[0].matcher, 'Bash');
  assert.match(entries(settings, 'Stop')[0].hooks[0].command, /\$CLAUDE_PROJECT_DIR\/\.claude\/ai-dev-kit\/rules\/hooks\/flow-guard\.js/);
});

test('E1 хуки I7: с флагом --codex хуки пишутся и в .codex/hooks.json', () => {
  const dir = repo();

  assert.equal(install(dir, '--codex').status, 0);
  assert.equal(install(dir, '--codex').status, 0);

  const codex = read(dir, '.codex/hooks.json');
  for (const event of ['SessionStart', 'Stop', 'PreToolUse']) assert.equal(entries(codex, event).length, 1, event);
  assert.equal(entries(codex, 'SessionStart')[0].matcher, 'startup');
  assert.equal(entries(codex, 'Stop')[0].matcher, undefined);
  assert.equal(entries(codex, 'PreToolUse')[0].matcher, 'Bash');
});
