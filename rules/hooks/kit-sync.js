#!/usr/bin/env node
'use strict';
// SessionStart hook for Claude Code and Codex (--agent claude|codex). Warns, never changes
// anything: the submodule is not initialized or lags behind the kit's main, plugins enabled in
// the project are not installed on this machine, or skills-lock.json still lists skills that the
// kit now ships as plugins. Lives in the submodule and is registered in the project's committed
// settings (see install-kit-sync.sh), so it still runs when the kit plugin itself is not installed.
// Always exits 0; prints {"systemMessage": "..."} only when there is something to say.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { legacySkills } = require('./legacy-skills.js');

const SUBMODULE = '.claude/ai-dev-kit';
const MARKETPLACE = 'ai-dev-kit';
const KIT_REPO = 'SatanLittleHelper/ai-dev-kit';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// A failed ls-remote (offline, no SSH key) is remembered briefly, so every session start does not wait for the timeout again.
const FAILURE_TTL_MS = 20 * 60 * 1000;
const GIT_TIMEOUT_MS = 3000;
const CODEX_TIMEOUT_MS = 5000;

function exec(cmd, args, timeout = GIT_TIMEOUT_MS) {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes -o ConnectTimeout=3',
  };
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout, env });
  return { status: result.status, stdout: (result.stdout || '').trim() };
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readCache(ctx) {
  return readJson(ctx.cacheFile) || {};
}

function writeCache(ctx, cache) {
  try {
    fs.mkdirSync(path.dirname(ctx.cacheFile), { recursive: true });
    const tmp = `${ctx.cacheFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, ctx.cacheFile);
  } catch {
    // cache is an optimization only
  }
}

function remoteHead(ctx, dir) {
  const cache = readCache(ctx);
  const hit = cache[dir];
  if (hit && ctx.now - hit.checkedAt < (hit.remote ? CACHE_TTL_MS : FAILURE_TTL_MS)) return hit.remote || null;
  const result = ctx.exec('git', ['-C', dir, 'ls-remote', 'origin', 'refs/heads/main']);
  const remote = result.status === 0 ? result.stdout.split(/\s+/)[0] : '';
  cache[dir] = { checkedAt: ctx.now, remote };
  writeCache(ctx, cache);
  return remote || null;
}

function checkSubmodule(ctx) {
  const dir = path.join(ctx.projectDir, SUBMODULE);
  if (!fs.existsSync(path.join(dir, 'rules', 'RULES.md'))) {
    return `ai-dev-kit: submodule ${SUBMODULE} не инициализирован. Выполни: git submodule update --init ${SUBMODULE}`;
  }
  const local = ctx.exec('git', ['-C', dir, 'rev-parse', 'HEAD']);
  if (local.status !== 0 || !local.stdout) return null;
  const remote = remoteHead(ctx, dir);
  if (!remote || remote === local.stdout) return null;
  // Exit 0: the pinned commit already contains remote main (equal or ahead). Anything else — behind,
  // or the commit is unknown locally — means the kit has newer changes.
  const contains = ctx.exec('git', ['-C', dir, 'merge-base', '--is-ancestor', remote, local.stdout]);
  if (contains.status === 0) return null;
  return `ai-dev-kit: submodule отстаёт от main кита. Выполни: git submodule update --init --remote ${SUBMODULE} (или скилл kit:update-ai-dev-kit)`;
}

function kitPluginNames(ctx) {
  const marketplace = readJson(path.join(ctx.projectDir, SUBMODULE, '.claude-plugin', 'marketplace.json'));
  if (!marketplace || !Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) return null;
  return new Set(marketplace.plugins.map((p) => p && p.name).filter(Boolean));
}

function checkClaudePlugins(ctx) {
  const settings = readJson(path.join(ctx.projectDir, '.claude', 'settings.json')) || {};
  const enabled = settings.enabledPlugins || {};
  const wanted = Object.keys(enabled).filter((id) => enabled[id] === true && id.endsWith(`@${MARKETPLACE}`));
  if (wanted.length === 0) return null;
  const installed = (readJson(path.join(ctx.claudeDir, 'plugins', 'installed_plugins.json')) || {}).plugins || {};
  // Any install record counts: project-scope records are keyed by projectPath, which differs for
  // git worktrees, and a false alarm there is worse than a missed one.
  // The submodule's marketplace.json is the list of plugins the kit really has. An enabled entry that
  // is not there (a renamed or removed plugin, e.g. the old "ai-dev-kit@ai-dev-kit") can never be
  // installed, so it gets "remove it", not an install command that fails.
  const known = kitPluginNames(ctx);
  const stale = known ? wanted.filter((id) => !known.has(id.slice(0, id.lastIndexOf('@')))) : [];
  const missing = wanted.filter((id) => !stale.includes(id) && !(installed[id] && installed[id].length > 0));
  const parts = [];
  if (missing.length > 0) {
    const commands = missing.map((id) => `claude plugin install ${id} --scope project`).join(' && ');
    parts.push(`плагины включены в проекте, но не установлены на этой машине: ${missing.join(', ')}. Выполни: ${commands}`);
  }
  if (stale.length > 0) {
    parts.push(`в .claude/settings.json включены плагины, которых нет в маркетплейсе ${MARKETPLACE} (переименованы или удалены): ${stale.join(', ')}. Удали их из enabledPlugins или перезапусти setup.sh`);
  }
  return parts.length > 0 ? `ai-dev-kit: ${parts.join('. ')}` : null;
}

function codexEnabledPlugins(toml) {
  const result = [];
  let current = null;
  for (const line of toml.split('\n')) {
    const header = line.match(/^\s*\[plugins\."([^"]+)"\]\s*$/);
    if (header) {
      current = header[1];
      continue;
    }
    if (/^\s*\[/.test(line)) {
      current = null;
      continue;
    }
    if (current && current.endsWith(`@${MARKETPLACE}`) && /^\s*enabled\s*=\s*true\b/.test(line)) result.push(current);
  }
  return result;
}

function checkCodexPlugins(ctx) {
  const wanted = codexEnabledPlugins(readText(path.join(ctx.projectDir, '.codex', 'config.toml')));
  if (wanted.length === 0) return null;
  const codexKey = `codex:${ctx.projectDir}`;
  const known = readCache(ctx)[codexKey];
  if (known && known.ids === wanted.join(',') && ctx.now - known.checkedAt < CACHE_TTL_MS) return null;
  const list = ctx.exec('codex', ['plugin', 'list', '--json'], CODEX_TIMEOUT_MS);
  if (list.status !== 0) return null;
  let installed;
  try {
    installed = (JSON.parse(list.stdout).installed || []).filter((p) => p.installed).map((p) => p.pluginId);
  } catch {
    return null;
  }
  const missing = wanted.filter((id) => !installed.includes(id));
  if (missing.length === 0) {
    // Spawning the Codex CLI is the slowest thing the hook does: remember "all installed" for a while.
    writeCache(ctx, { ...readCache(ctx), [codexKey]: { checkedAt: ctx.now, ids: wanted.join(',') } });
    return null;
  }
  const adds = missing.map((id) => `codex plugin add ${id}`).join(' && ');
  return `ai-dev-kit: плагины включены в .codex/config.toml, но не установлены: ${missing.join(', ')}. Выполни: codex plugin marketplace add git@github.com:${KIT_REPO}.git && ${adds}`;
}

function checkLegacy(ctx) {
  const names = legacySkills(readJson(path.join(ctx.projectDir, 'skills-lock.json')));
  if (names.length === 0) return null;
  return `ai-dev-kit: в skills-lock.json остались скиллы, которые теперь ставятся плагинами: ${names.join(', ')}. Выполни: bash ${SUBMODULE}/mods/migrate-legacy-skills.sh`;
}

function collectMessages(ctx) {
  const pluginCheck = ctx.agent === 'codex' ? checkCodexPlugins : checkClaudePlugins;
  return [checkSubmodule(ctx), pluginCheck(ctx), checkLegacy(ctx)].filter(Boolean);
}

module.exports = { checkSubmodule, checkClaudePlugins, checkCodexPlugins, checkLegacy, codexEnabledPlugins, collectMessages };

if (require.main === module) {
  try {
    const agentIndex = process.argv.indexOf('--agent');
    const agent = agentIndex >= 0 && process.argv[agentIndex + 1] === 'codex' ? 'codex' : 'claude';
    const projectDir = process.env.CLAUDE_PROJECT_DIR || exec('git', ['rev-parse', '--show-toplevel']).stdout || process.cwd();
    const home = os.homedir();
    const messages = collectMessages({
      agent, projectDir, claudeDir: process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), now: Date.now(), exec,
      cacheFile: path.join(home, '.cache', 'ai-dev-kit', 'kit-sync.json'),
    });
    if (messages.length > 0) process.stdout.write(JSON.stringify({ systemMessage: messages.join('\n') }));
  } catch {
    // a broken check must never break the session start
  }
  process.exit(0);
}
