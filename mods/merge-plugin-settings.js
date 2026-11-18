#!/usr/bin/env node
'use strict';
// Idempotently enables plugins from a GitHub marketplace inside an existing (or empty)
// .claude/settings.json: registers the marketplace under extraKnownMarketplaces and sets
// enabledPlugins["<plugin>@<marketplace>"] to true, without touching anything else in the file.
// A plugin that is already listed (even as false: someone opted out) is left as it is.
// With --auto-update the marketplace also gets autoUpdate: true (added only when the field is absent).
// Called by install-mods.sh.

const fs = require('fs');

const [, , settingsFile, marketplaceName, repo, ...rest] = process.argv;
const AUTO_UPDATE_FLAG = '--auto-update';
const autoUpdate = rest.includes(AUTO_UPDATE_FLAG);
const plugins = rest.filter((arg) => arg !== AUTO_UPDATE_FLAG);
if (!settingsFile || !marketplaceName || !repo || plugins.length === 0) {
  console.error('Usage: merge-plugin-settings.js <settings.json path> <marketplace name> <owner/repo> [--auto-update] <plugin>...');
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

let isChanged = false;

settings.extraKnownMarketplaces = settings.extraKnownMarketplaces || {};
const known = settings.extraKnownMarketplaces[marketplaceName];
if (!known) {
  settings.extraKnownMarketplaces[marketplaceName] = { source: { source: 'github', repo }, ...(autoUpdate ? { autoUpdate: true } : {}) };
  isChanged = true;
} else if (autoUpdate && !('autoUpdate' in known)) {
  // Only add the missing field: an explicit autoUpdate: false is the project's own choice.
  known.autoUpdate = true;
  isChanged = true;
}

settings.enabledPlugins = settings.enabledPlugins || {};
// "ai-dev-kit" was a plugin of this marketplace before it was split into kit and friends. The entry
// can no longer be installed and only makes kit-sync suggest a command that fails.
const legacyKey = `${marketplaceName}@${marketplaceName}`;
if (legacyKey in settings.enabledPlugins && !plugins.includes(marketplaceName)) {
  delete settings.enabledPlugins[legacyKey];
  isChanged = true;
}
for (const plugin of plugins) {
  const key = `${plugin}@${marketplaceName}`;
  if (!(key in settings.enabledPlugins)) {
    settings.enabledPlugins[key] = true;
    isChanged = true;
  }
}

if (!isChanged) {
  console.log(`-- mods already enabled in ${settingsFile}, skipping`);
  process.exit(0);
}

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
console.log(`-- enabled ${plugins.join(', ')} from marketplace ${marketplaceName} in ${settingsFile}`);
