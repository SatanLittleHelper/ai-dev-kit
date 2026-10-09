#!/usr/bin/env node
'use strict';
// Idempotently enables plugins from a GitHub marketplace inside an existing (or empty)
// .claude/settings.json: registers the marketplace under extraKnownMarketplaces and sets
// enabledPlugins["<plugin>@<marketplace>"] to true, without touching anything else in the file.
// A plugin that is already listed (even as false: someone opted out) is left as it is.
// Called by install-mods.sh.

const fs = require('fs');

const [, , settingsFile, marketplaceName, repo, ...plugins] = process.argv;
if (!settingsFile || !marketplaceName || !repo || plugins.length === 0) {
  console.error('Usage: merge-plugin-settings.js <settings.json path> <marketplace name> <owner/repo> <plugin>...');
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
if (!settings.extraKnownMarketplaces[marketplaceName]) {
  settings.extraKnownMarketplaces[marketplaceName] = { source: { source: 'github', repo } };
  isChanged = true;
}

settings.enabledPlugins = settings.enabledPlugins || {};
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
