const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const installer = path.join(__dirname, 'install.sh');
function fixture(t, { cli = true, settings = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-deps-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(dir, '.claude'));
  const settingsFile = path.join(dir, '.claude/settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify(settings));
  const log = path.join(dir, 'calls');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: log, FIXTURE_BIN: bin };
  function executable(name, body) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  }
  executable('claude', 'echo "claude $*" >> "$CALLS"\nif [ "${FAIL_PLUGIN:-}" = 1 ]; then echo "registry offline" >&2; exit 7; fi\nif [ "$*" = "plugin marketplace list --json" ]; then echo \'[{"name":"plannotator","repo":"backnotprop/plannotator"}]\'; fi\nif [ "$1 $2 $3" = "plugin marketplace add" ] && [ "$4" = backnotprop/plannotator ]; then echo "already registered" >&2; exit 1; fi');
  executable('curl', 'echo "curl $*" >> "$CALLS"\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; target="$1"; fi; shift; done\nif [ "${FAIL_DOWNLOAD:-}" = 1 ]; then echo "download failed" >&2; exit 22; fi\ncat > "$target" <<\'INSTALL\'\necho "installer $*" >> "$CALLS"\nprintf \'#!/bin/bash\\necho "plannotator $*" >> "$CALLS"\\n\' > "$FIXTURE_BIN/plannotator"\nchmod +x "$FIXTURE_BIN/plannotator"\nINSTALL');
  if (cli) executable('plannotator', 'echo "plannotator $*" >> "$CALLS"');
  // Prevent the developer's installed CLI from satisfying a missing-CLI test.
  env.AI_DEV_KIT_PLANNOTATOR_BIN = path.join(bin, 'plannotator');
  const init = spawnSync('git', ['init', '-q', dir]);
  assert.equal(init.status, 0);
  return {
    run(args = [], extraEnv = {}) { return spawnSync('bash', [installer, ...args], { cwd: dir, env: { ...env, ...extraEnv }, encoding: 'utf8' }); },
    settings: () => JSON.parse(fs.readFileSync(settingsFile, 'utf8')),
    calls: () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '',
    raw: () => fs.readFileSync(settingsFile, 'utf8'),
    shadowCli() {
      const shadow = path.join(dir, 'shadow');
      fs.mkdirSync(shadow);
      fs.writeFileSync(path.join(shadow, 'plannotator'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
      env.PATH = `${shadow}:${env.PATH}`;
    },
  };
}

test('registers official plugins, preserves settings and is repeatable', t => {
  const f = fixture(t, { settings: { permissions: { allow: ['Read'] }, enabledPlugins: { 'other@custom': true } } });
  let result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.settings().enabledPlugins['superpowers@superpowers-marketplace'], true);
  assert.equal(f.settings().enabledPlugins['plannotator@plannotator'], true);
  assert.deepEqual(f.settings().permissions, { allow: ['Read'] });
  assert.equal(f.settings().enabledPlugins['other@custom'], true);
  assert.equal(f.settings().extraKnownMarketplaces.plannotator.source.repo, 'backnotprop/plannotator');
  const before = f.raw();
  result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.raw(), before);
  assert.doesNotMatch(f.calls(), /curl /);
  assert.match(f.calls(), /plugin install superpowers@superpowers-marketplace --scope project/);
});

test('honors explicitly disabled plugins', t => {
  const f = fixture(t, { settings: { enabledPlugins: { 'superpowers@superpowers-marketplace': false, 'plannotator@plannotator': false } } });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.settings().enabledPlugins['superpowers@superpowers-marketplace'], false);
  assert.doesNotMatch(f.calls(), /plugin install|curl /);
});

test('installs a missing Plannotator binary with minimal integration', t => {
  const f = fixture(t, { cli: false });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls(), /https:\/\/plannotator.ai\/install.sh/);
  assert.match(f.calls(), /installer --minimal/);
  assert.match(f.calls(), /plannotator --version/);
});

test('update refreshes marketplaces, plugins and CLI', t => {
  const f = fixture(t);
  const result = f.run(['--update']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.calls(), /plugin marketplace update superpowers-marketplace/);
  assert.match(f.calls(), /plugin update plannotator@plannotator --scope project/);
  assert.match(f.calls(), /installer --minimal/);
});

test('plugin failures are visible and return failure', t => {
  const f = fixture(t);
  const result = f.run([], { FAIL_PLUGIN: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /registry offline/);
});

test('download failures are visible and do not run an empty installer', t => {
  const f = fixture(t, { cli: false });
  const result = f.run([], { FAIL_DOWNLOAD: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /download failed/);
  assert.doesNotMatch(f.calls(), /installer --minimal/);
});

test('rejects a conflicting project marketplace without installing from it', t => {
  const f = fixture(t, { settings: { extraKnownMarketplaces: {
    'superpowers-marketplace': { source: { source: 'github', repo: 'another/repo' } },
  } } });
  const before = f.raw();
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /different source/);
  assert.doesNotMatch(f.calls(), /plugin install/);
  assert.equal(f.raw(), before);
});

test('unknown arguments fail before making changes', t => {
  const f = fixture(t);
  const result = f.run(['--unexpected']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
  assert.equal(f.calls(), '');
});

test('update reports an older CLI shadowing the installed binary', t => {
  const f = fixture(t);
  f.shadowCli();
  const result = f.run(['--update']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /shadows/);
});
