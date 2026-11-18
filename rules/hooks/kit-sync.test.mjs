import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const kit = createRequire(import.meta.url)('./kit-sync.js');

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const NOW = 1_700_000_000_000;

function project({ submodule = true, settings, codexToml, lock } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-sync-'));
  if (submodule) {
    mkdirSync(join(dir, '.claude', 'ai-dev-kit', 'rules'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'ai-dev-kit', 'rules', 'RULES.md'), '');
  }
  if (settings) {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify(settings));
  }
  if (codexToml) {
    mkdirSync(join(dir, '.codex'), { recursive: true });
    writeFileSync(join(dir, '.codex', 'config.toml'), codexToml);
  }
  if (lock) writeFileSync(join(dir, 'skills-lock.json'), JSON.stringify(lock));
  return dir;
}

function claudeDir(installed = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'kit-claude-'));
  mkdirSync(join(dir, 'plugins'), { recursive: true });
  writeFileSync(join(dir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: installed }));
  return dir;
}

// exec stub: table maps substrings of "cmd arg arg" to results; calls are recorded.
function stub(table) {
  const calls = [];
  const exec = (cmd, args) => {
    const line = [cmd, ...args].join(' ');
    calls.push(line);
    for (const [prefix, result] of Object.entries(table)) {
      if (line.includes(prefix)) return result;
    }
    return { status: 1, stdout: '' };
  };
  return { exec, calls };
}

const ctxFor = (projectDir, exec, extra = {}) => ({
  agent: 'claude', projectDir, claudeDir: claudeDir(), now: NOW, exec,
  cacheFile: join(mkdtempSync(join(tmpdir(), 'kit-cache-')), 'cache.json'), ...extra,
});

test('K1: submodule не инициализирован — подсказка git submodule update --init', () => {
  const ctx = ctxFor(project({ submodule: false }), stub({}).exec);
  assert.match(kit.checkSubmodule(ctx), /git submodule update --init \.claude\/ai-dev-kit/);
});

test('K2: submodule отстаёт от main — предупреждение', () => {
  const { exec } = stub({ 'rev-parse HEAD': { status: 0, stdout: A }, 'ls-remote': { status: 0, stdout: `${B}\trefs/heads/main` }, 'merge-base': { status: 1, stdout: '' } });
  assert.match(kit.checkSubmodule(ctxFor(project(), exec)), /отстаёт/);
});

test('K3: указатель совпадает с main или впереди него — тишина', () => {
  const same = stub({ 'rev-parse HEAD': { status: 0, stdout: A }, 'ls-remote': { status: 0, stdout: `${A}\trefs/heads/main` } });
  assert.equal(kit.checkSubmodule(ctxFor(project(), same.exec)), null);
  const ahead = stub({ 'rev-parse HEAD': { status: 0, stdout: A }, 'ls-remote': { status: 0, stdout: `${B}\trefs/heads/main` }, 'merge-base': { status: 0, stdout: '' } });
  assert.equal(kit.checkSubmodule(ctxFor(project(), ahead.exec)), null);
});

test('K4: нет сети (ls-remote упал) — тишина', () => {
  const { exec } = stub({ 'rev-parse HEAD': { status: 0, stdout: A }, 'ls-remote': { status: 128, stdout: '' } });
  assert.equal(kit.checkSubmodule(ctxFor(project(), exec)), null);
});

test('K5: результат ls-remote кешируется на TTL', () => {
  const { exec, calls } = stub({ 'rev-parse HEAD': { status: 0, stdout: A }, 'ls-remote': { status: 0, stdout: `${A}\trefs/heads/main` } });
  const ctx = ctxFor(project(), exec);
  kit.checkSubmodule(ctx);
  kit.checkSubmodule({ ...ctx, now: NOW + 60_000 });
  assert.equal(calls.filter((c) => c.includes('ls-remote')).length, 1);
  kit.checkSubmodule({ ...ctx, now: NOW + 7 * 3_600_000 });
  assert.equal(calls.filter((c) => c.includes('ls-remote')).length, 2);
});

test('K6: Claude — плагин включён в проекте, но не установлен', () => {
  const dir = project({ settings: { enabledPlugins: { 'kit@ai-dev-kit': true, 'polish@ai-dev-kit': false, 'other@elsewhere': true } } });
  const message = kit.checkClaudePlugins(ctxFor(dir, stub({}).exec));
  assert.match(message, /kit@ai-dev-kit/);
  assert.match(message, /claude plugin install kit@ai-dev-kit --scope project/);
  assert.doesNotMatch(message, /polish|other@elsewhere/);
});

test('K7: Claude — установленный плагин не вызывает предупреждений', () => {
  const dir = project({ settings: { enabledPlugins: { 'kit@ai-dev-kit': true } } });
  const installed = claudeDir({ 'kit@ai-dev-kit': [{ scope: 'project', projectPath: '/somewhere' }] });
  assert.equal(kit.checkClaudePlugins(ctxFor(dir, stub({}).exec, { claudeDir: installed })), null);
});

test('K8: Codex — разбор .codex/config.toml берёт только включённые плагины кита', () => {
  const toml = '[plugins."kit@ai-dev-kit"]\nenabled = true\n\n[plugins."x@ai-dev-kit"]\nenabled = false\n\n[plugins."y@other"]\nenabled = true\n';
  assert.deepEqual(kit.codexEnabledPlugins(toml), ['kit@ai-dev-kit']);
});

test('K9: Codex — включён, но не установлен', () => {
  const dir = project({ codexToml: '[plugins."kit@ai-dev-kit"]\nenabled = true\n' });
  const { exec } = stub({ 'codex plugin list': { status: 0, stdout: JSON.stringify({ installed: [] }) } });
  const message = kit.checkCodexPlugins(ctxFor(dir, exec, { agent: 'codex' }));
  assert.match(message, /codex plugin marketplace add/);
  assert.match(message, /codex plugin add kit@ai-dev-kit/);
});

test('K10: Codex — установлен, или codex недоступен — тишина', () => {
  const dir = project({ codexToml: '[plugins."kit@ai-dev-kit"]\nenabled = true\n' });
  const ok = stub({ 'codex plugin list': { status: 0, stdout: JSON.stringify({ installed: [{ pluginId: 'kit@ai-dev-kit', installed: true }] }) } });
  assert.equal(kit.checkCodexPlugins(ctxFor(dir, ok.exec, { agent: 'codex' })), null);
  const broken = stub({ 'codex plugin list': { status: null, stdout: '' } });
  assert.equal(kit.checkCodexPlugins(ctxFor(dir, broken.exec, { agent: 'codex' })), null);
});

test('K11: остались скиллы кита в skills-lock.json — подсказка по очистке', () => {
  const dir = project({ lock: { skills: { roadmap: { source: 'SatanLittleHelper/ai-dev-kit' } } } });
  const message = kit.checkLegacy(ctxFor(dir, stub({}).exec));
  assert.match(message, /roadmap/);
  assert.match(message, /migrate-legacy-skills\.sh/);
});

test('K12: collectMessages выбирает проверку плагинов по агенту и пропускает пустые', () => {
  const dir = project({ settings: { enabledPlugins: { 'kit@ai-dev-kit': true } } });
  const { exec } = stub({ 'rev-parse HEAD': { status: 0, stdout: A }, 'ls-remote': { status: 0, stdout: `${A}\trefs/heads/main` } });
  const messages = kit.collectMessages(ctxFor(dir, exec));
  assert.equal(messages.length, 1);
  assert.match(messages[0], /не установлены/);
});

test('K14: неудачный ls-remote тоже кешируется, но ненадолго', () => {
  const { exec, calls } = stub({ 'rev-parse HEAD': { status: 0, stdout: A }, 'ls-remote': { status: 128, stdout: '' } });
  const ctx = ctxFor(project(), exec);
  kit.checkSubmodule(ctx);
  kit.checkSubmodule({ ...ctx, now: NOW + 60_000 });
  assert.equal(calls.filter((c) => c.includes('ls-remote')).length, 1);
  kit.checkSubmodule({ ...ctx, now: NOW + 25 * 60_000 });
  assert.equal(calls.filter((c) => c.includes('ls-remote')).length, 2);
});

test('K15: Codex — результат «всё установлено» кешируется, предупреждение — нет', () => {
  const toml = '[plugins."kit@ai-dev-kit"]\nenabled = true\n';
  const dir = project({ codexToml: toml });
  const ok = stub({ 'codex plugin list': { status: 0, stdout: JSON.stringify({ installed: [{ pluginId: 'kit@ai-dev-kit', installed: true }] }) } });
  const ctx = ctxFor(dir, ok.exec, { agent: 'codex' });
  kit.checkCodexPlugins(ctx);
  kit.checkCodexPlugins({ ...ctx, now: NOW + 60_000 });
  assert.equal(ok.calls.filter((c) => c.includes('codex plugin list')).length, 1);

  const missing = stub({ 'codex plugin list': { status: 0, stdout: JSON.stringify({ installed: [] }) } });
  const ctx2 = ctxFor(project({ codexToml: toml }), missing.exec, { agent: 'codex' });
  assert.ok(kit.checkCodexPlugins(ctx2));
  assert.ok(kit.checkCodexPlugins({ ...ctx2, now: NOW + 60_000 }));
  assert.equal(missing.calls.filter((c) => c.includes('codex plugin list')).length, 2);
});
