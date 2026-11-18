import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('./install-kit-sync.sh', import.meta.url).pathname;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'kit-sync-install-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}
const install = (cwd, ...args) => spawnSync('bash', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
const read = (dir, rel) => JSON.parse(readFileSync(join(dir, rel), 'utf8'));
const entries = (json) => json.hooks.SessionStart.filter((e) => e.hooks.some((h) => h.command.includes('kit-sync.js')));

test('I1: регистрирует SessionStart-хук в .claude/settings.json и не трогает остальное', () => {
  const dir = repo();
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [] }] } }));
  const result = install(dir);
  assert.equal(result.status, 0, result.stderr);
  const settings = read(dir, '.claude/settings.json');
  assert.deepEqual(settings.permissions, { allow: ['Bash(ls)'] });
  assert.equal(settings.hooks.PreToolUse.length, 1);
  const [entry] = entries(settings);
  assert.match(entry.hooks[0].command, /\$CLAUDE_PROJECT_DIR\/\.claude\/ai-dev-kit\/rules\/hooks\/kit-sync\.js" --agent claude/);
  assert.match(entry.hooks[0].command, /git submodule update --init/);
  assert.equal(existsSync(join(dir, '.codex', 'hooks.json')), false);
});

test('I2: повторный запуск идемпотентен', () => {
  const dir = repo();
  install(dir);
  install(dir);
  assert.equal(entries(read(dir, '.claude/settings.json')).length, 1);
});

test('I3: --codex добавляет хук в .codex/hooks.json с матчером startup', () => {
  const dir = repo();
  const result = install(dir, '--codex');
  assert.equal(result.status, 0, result.stderr);
  const [entry] = entries(read(dir, '.codex/hooks.json'));
  assert.equal(entry.matcher, 'startup');
  assert.match(entry.hooks[0].command, /--agent codex/);
  assert.equal(entry.hooks[0].timeout, 10);
  install(dir, '--codex');
  assert.equal(entries(read(dir, '.codex/hooks.json')).length, 1);
});
