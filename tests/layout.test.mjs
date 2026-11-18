import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const marketplace = readJson('.claude-plugin/marketplace.json');
const localEntries = marketplace.plugins.filter((p) => typeof p.source === 'string');

test('L1: у плагинов кита нет поля version (обновление идёт по SHA коммита)', () => {
  for (const entry of marketplace.plugins) {
    assert.ok(!('version' in entry), `marketplace: ${entry.name}`);
  }
  for (const entry of localEntries) {
    const manifest = readJson(join(entry.source, '.claude-plugin', 'plugin.json'));
    assert.ok(!('version' in manifest), `${entry.name}/plugin.json`);
    assert.equal(manifest.name, entry.name);
  }
});

test('L2: плагин kit содержит скиллы, у каждого SKILL.md с name = имени папки', () => {
  const kit = localEntries.find((p) => p.name === 'kit');
  assert.ok(kit, 'kit отсутствует в marketplace.json');
  const skillsDir = join(ROOT, kit.source, 'skills');
  const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(dirs.length > 0);
  for (const dir of dirs) {
    const text = readFileSync(join(skillsDir, dir.name, 'SKILL.md'), 'utf8');
    const match = text.split('\n').slice(0, 20).join('\n').match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m);
    assert.ok(match, `${dir.name}: нет name во frontmatter`);
    assert.equal(match[1], dir.name);
  }
});

test('L3: старой папки skills/ в корне больше нет', () => {
  assert.equal(existsSync(join(ROOT, 'skills')), false);
});

const codexCatalog = readJson('.agents/plugins/marketplace.json');
const CODEX_SOURCES = new Set(['url', 'git-subdir', 'npm', 'local']);

function assertCodexReadable(entry, where) {
  if (typeof entry.source === 'string') {
    assert.ok(entry.source.startsWith('./'), `${where}: ${entry.name} — относительный путь должен начинаться с ./`);
    return;
  }
  assert.ok(
    CODEX_SOURCES.has(entry.source.source),
    `${where}: ${entry.name} использует источник "${entry.source.source}", который Codex не поддерживает`,
  );
}

test('L4: Codex-каталог содержит kit, Codex PR-flow и два стековых плагина', () => {
  assert.equal(codexCatalog.name, 'ai-dev-kit');
  assert.deepEqual(codexCatalog.plugins.map((p) => p.name).sort(), ['angular-best-practices', 'kit', 'nestjs-best-practices', 'pr-flow']);
  for (const entry of codexCatalog.plugins) assertCodexReadable(entry, 'codex');
});

test('L5: внешние записи Claude-marketplace закреплены по sha и читаются Codex', () => {
  const external = marketplace.plugins.filter((p) => typeof p.source !== 'string');
  assert.deepEqual(external.map((p) => p.name).sort(), ['angular-best-practices', 'nestjs-best-practices']);
  for (const entry of external) {
    assertCodexReadable(entry, 'claude');
    assert.match(entry.source.sha, /^[0-9a-f]{40}$/, `${entry.name}: sha должен быть полным`);
  }
});

test('L6: источники записей в обоих каталогах совпадают', () => {
  for (const entry of codexCatalog.plugins) {
    if (entry.name === 'pr-flow') {
      assert.equal(entry.source, './plugins/pr-flow-codex');
      assert.equal(marketplace.plugins.find(p => p.name === 'pr-flow').source, './mods/pr-flow');
      continue;
    }
    const twin = marketplace.plugins.find((p) => p.name === entry.name);
    assert.ok(twin, `${entry.name} нет в Claude-marketplace`);
    assert.deepEqual(entry.source, twin.source);
  }
});
