#!/usr/bin/env node
'use strict';
// Idempotently appends `[plugins."<id>"]\nenabled = true` sections to a Codex config.toml for every
// plugin id that has no such section yet. A section that already exists is left as it is, even with
// enabled = false (someone opted out). Called by install-codex-plugins.sh.
// Usage: merge-codex-config.js <config.toml> <plugin@marketplace>...

const fs = require('fs');

const [, , file, ...ids] = process.argv;
if (!file || ids.length === 0) {
  console.error('Usage: merge-codex-config.js <config.toml> <plugin@marketplace>...');
  process.exit(1);
}

let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const added = [];
for (const id of ids) {
  const header = `[plugins."${id}"]`;
  if (text.split('\n').some((line) => line.trim() === header)) continue;
  if (text) text = `${text.trimEnd()}\n\n`;
  text += `${header}\nenabled = true\n`;
  added.push(id);
}

if (added.length === 0) {
  console.log(`-- plugins already configured in ${file}, skipping`);
  process.exit(0);
}
fs.writeFileSync(file, text);
console.log(`-- enabled ${added.join(', ')} in ${file}`);
