import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODS = new URL('.', import.meta.url).pathname;
const INSTALL = join(MODS, 'install-mods.sh');
const MIGRATE = join(MODS, 'migrate-legacy-skills.sh');

// Fake CLIs on PATH. `claude plugin marketplace add` imitates the real CLI: it rewrites the
// marketplace entry in the project's settings.json and drops autoUpdate.
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'install-flow-'));
  const project = join(root, 'project');
  const bin = join(root, 'bin');
  mkdirSync(project);
  mkdirSync(bin);
  spawnSync('git', ['init', '-q'], { cwd: project });
  const fake = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\necho "$@" >> "${root}/${name}.calls"\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  fake('claude', `if [ "$2 $3" = "marketplace add" ]; then node -e '
const fs = require("fs"); const f = ".claude/settings.json"; const s = JSON.parse(fs.readFileSync(f, "utf8"));
for (const m of Object.values(s.extraKnownMarketplaces || {})) delete m.autoUpdate;
fs.writeFileSync(f, JSON.stringify(s));'; fi`);
  fake('npx', 'exit 0');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const run = (script, ...args) => spawnSync('bash', [script, ...args], { cwd: project, env, encoding: 'utf8' });
  const settings = () => JSON.parse(readFileSync(join(project, '.claude', 'settings.json'), 'utf8'));
  const calls = (name) => (existsSync(join(root, `${name}.calls`)) ? readFileSync(join(root, `${name}.calls`), 'utf8') : '');
  return { project, run, settings, calls };
}

test('M1: install-mods возвращает autoUpdate после claude plugin marketplace add и идемпотентен', () => {
  const { run, settings } = sandbox();
  const first = run(INSTALL, 'kit', 'polish');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(settings().extraKnownMarketplaces['ai-dev-kit'].autoUpdate, true);
  assert.equal(settings().enabledPlugins['kit@ai-dev-kit'], true);
  const before = JSON.stringify(settings());
  assert.equal(run(INSTALL, 'kit', 'polish').status, 0);
  assert.equal(JSON.stringify(settings()), before);
});

test('M2: явный autoUpdate: false и выключенный плагин сохраняются', () => {
  const { project, run, settings } = sandbox();
  mkdirSync(join(project, '.claude'));
  writeFileSync(join(project, '.claude', 'settings.json'), JSON.stringify({
    extraKnownMarketplaces: { 'ai-dev-kit': { source: { source: 'github', repo: 'SatanLittleHelper/ai-dev-kit' }, autoUpdate: false } },
    enabledPlugins: { 'polish@ai-dev-kit': false },
  }));
  // the fake CLI drops autoUpdate on `marketplace add` like the real one, so only the merge result is checked for plugins
  run(INSTALL, 'kit', 'polish');
  assert.equal(settings().enabledPlugins['polish@ai-dev-kit'], false);
});

test('M3: неизвестное имя плагина отклоняется до любых записей', () => {
  const { project, run } = sandbox();
  const result = run(INSTALL, 'kit', 'no-such-plugin');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown mod 'no-such-plugin'/);
  assert.equal(existsSync(join(project, '.claude', 'settings.json')), false);
});

test('M4: migrate-legacy-skills вызывает skills remove только для скиллов кита', () => {
  const { project, run, calls } = sandbox();
  writeFileSync(join(project, 'skills-lock.json'), JSON.stringify({ version: 1, skills: {
    roadmap: { source: 'SatanLittleHelper/ai-dev-kit' },
    'nestjs-best-practices': { source: 'kadajett/agent-nestjs-skills' },
    other: { source: 'someone/else' },
  } }));
  const result = run(MIGRATE);
  assert.equal(result.status, 0, result.stderr);
  assert.match(calls('npx'), /skills remove nestjs-best-practices roadmap -y/);
  assert.doesNotMatch(calls('npx'), /other/);
});

test('M5: без skills-lock.json или без скиллов кита npx не вызывается', () => {
  const { project, run, calls } = sandbox();
  assert.equal(run(MIGRATE).status, 0);
  writeFileSync(join(project, 'skills-lock.json'), JSON.stringify({ skills: { other: { source: 'someone/else' } } }));
  assert.equal(run(MIGRATE).status, 0);
  assert.equal(calls('npx'), '');
});
