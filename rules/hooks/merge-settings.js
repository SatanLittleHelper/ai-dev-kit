#!/usr/bin/env node
'use strict';
// Idempotently registers a command hook entry inside an existing (or empty) hooks JSON file
// (.claude/settings.json, .codex/hooks.json), without touching anything else already in it. Called by
// install-hook.sh (PreToolUse/Bash commit-rules hook) and install-kit-sync.sh (SessionStart hook) —
// see those scripts for why the project's committed settings are the right target and not the
// user's global or local settings file.
// Usage: merge-settings.js <file> <hook command> <marker substring> [--event <name>] [--matcher <regex>] [--timeout <seconds>]
// Defaults: --event PreToolUse, and then --matcher Bash; other events get no matcher unless given.

const fs = require('fs');

const [, , settingsFile, hookCommand, markerSubstring, ...rest] = process.argv;
if (!settingsFile || !hookCommand || !markerSubstring) {
  console.error('Usage: merge-settings.js <file> <hook command> <marker substring> [--event <name>] [--matcher <regex>] [--timeout <seconds>]');
  process.exit(1);
}
const option = (name) => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
};
const event = option('--event') || 'PreToolUse';
const matcher = option('--matcher') || (event === 'PreToolUse' ? 'Bash' : undefined);
const timeout = option('--timeout');

const raw = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile, 'utf8') : '';
let settings;
try {
  settings = raw.trim() ? JSON.parse(raw) : {};
} catch (err) {
  console.error(`Error: ${settingsFile} is not valid JSON — fix it manually first (${err.message}).`);
  process.exit(1);
}

settings.hooks = settings.hooks || {};
settings.hooks[event] = settings.hooks[event] || [];

const alreadyInstalled = settings.hooks[event].some(
  (entry) =>
    entry &&
    Array.isArray(entry.hooks) &&
    entry.hooks.some((h) => typeof h.command === 'string' && h.command.includes(markerSubstring))
);

if (alreadyInstalled) {
  console.log(`-- ${markerSubstring} hook already registered in ${settingsFile}, skipping`);
  process.exit(0);
}

settings.hooks[event].push({
  ...(matcher ? { matcher } : {}),
  hooks: [{ type: 'command', command: hookCommand, ...(timeout ? { timeout: Number(timeout) } : {}) }],
});

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
console.log(`-- registered ${markerSubstring} hook in ${settingsFile}`);
