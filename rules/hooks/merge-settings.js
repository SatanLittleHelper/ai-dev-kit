#!/usr/bin/env node
'use strict';
// Idempotently registers a PreToolUse/Bash hook entry inside an existing (or empty)
// .claude/settings.json, without touching anything else already in that file. Called by
// install-hook.sh — see that script for why settings.json (project-shared, committed) is
// the right target and not the user's global or local settings file.

const fs = require('fs');

const [, , settingsFile, hookCommand, markerSubstring] = process.argv;
if (!settingsFile || !hookCommand || !markerSubstring) {
  console.error('Usage: merge-settings.js <settings.json path> <hook command> <marker substring>');
  process.exit(1);
}

const raw = fs.readFileSync(settingsFile, 'utf8');
let settings;
try {
  settings = raw.trim() ? JSON.parse(raw) : {};
} catch (err) {
  console.error(`Error: ${settingsFile} is not valid JSON — fix it manually first (${err.message}).`);
  process.exit(1);
}

settings.hooks = settings.hooks || {};
settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];

const alreadyInstalled = settings.hooks.PreToolUse.some(
  (entry) =>
    entry &&
    Array.isArray(entry.hooks) &&
    entry.hooks.some((h) => typeof h.command === 'string' && h.command.includes(markerSubstring))
);

if (alreadyInstalled) {
  console.log(`-- commit-rules hook already registered in ${settingsFile}, skipping`);
  process.exit(0);
}

settings.hooks.PreToolUse.push({
  matcher: 'Bash',
  hooks: [{ type: 'command', command: hookCommand }],
});

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
console.log(`-- registered commit-rules hook in ${settingsFile}`);
