import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('./merge-plugin-settings.js', import.meta.url).pathname;
const REPO = 'SatanLittleHelper/ai-dev-kit';

function merge(initial, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-plugin-'));
  const file = join(dir, 'settings.json');
  writeFileSync(file, JSON.stringify(initial));
  const result = spawnSync('node', [SCRIPT, file, 'ai-dev-kit', REPO, ...args], { encoding: 'utf8' });
  return { result, file, settings: JSON.parse(readFileSync(file, 'utf8')) };
}

test('A1: новый marketplace с --auto-update получает autoUpdate: true и плагин включается', () => {
  const { result, settings } = merge({}, '--auto-update', 'kit');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(settings.extraKnownMarketplaces['ai-dev-kit'], { source: { source: 'github', repo: REPO }, autoUpdate: true });
  assert.equal(settings.enabledPlugins['kit@ai-dev-kit'], true);
});

test('A2: существующая запись без autoUpdate дополняется, source не трогается', () => {
  const initial = { extraKnownMarketplaces: { 'ai-dev-kit': { source: { source: 'github', repo: REPO } } }, enabledPlugins: { 'kit@ai-dev-kit': true } };
  const { settings } = merge(initial, '--auto-update', 'kit');
  assert.deepEqual(settings.extraKnownMarketplaces['ai-dev-kit'], { source: { source: 'github', repo: REPO }, autoUpdate: true });
});

test('A3: явный autoUpdate: false не перезаписывается', () => {
  const initial = { extraKnownMarketplaces: { 'ai-dev-kit': { source: { source: 'github', repo: REPO }, autoUpdate: false } } };
  const { settings } = merge(initial, '--auto-update', 'kit');
  assert.equal(settings.extraKnownMarketplaces['ai-dev-kit'].autoUpdate, false);
});

test('A4: без флага autoUpdate не появляется (чужие marketplace)', () => {
  const { settings } = merge({}, 'kit');
  assert.ok(!('autoUpdate' in settings.extraKnownMarketplaces['ai-dev-kit']));
});

test('A5: повторный запуск идемпотентен, явно выключенный плагин остаётся выключенным', () => {
  const first = merge({ enabledPlugins: { 'polish@ai-dev-kit': false } }, '--auto-update', 'kit', 'polish');
  assert.equal(first.settings.enabledPlugins['polish@ai-dev-kit'], false);
  const second = spawnSync('node', [SCRIPT, first.file, 'ai-dev-kit', REPO, '--auto-update', 'kit', 'polish'], { encoding: 'utf8' });
  assert.equal(second.status, 0);
  assert.match(second.stdout, /already enabled/);
  assert.deepEqual(JSON.parse(readFileSync(first.file, 'utf8')), first.settings);
});
