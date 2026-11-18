#!/usr/bin/env node
'use strict';
// Names of skills in skills-lock.json that the kit now ships as plugins (kit itself and the two stack
// best-practices). Used by kit-sync.js (warning) and mods/migrate-legacy-skills.sh (cleanup).
// CLI: node legacy-skills.js [path/to/skills-lock.json] — prints one name per line.

const fs = require('fs');

const LEGACY_SOURCES = [
  'SatanLittleHelper/ai-dev-kit',
  'alfredoperez/angular-best-practices',
  'kadajett/agent-nestjs-skills',
];

// Names end up as arguments of `skills remove`: accept only plain skill names, never flags or globs.
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;

function legacySkills(lock) {
  const skills = (lock && lock.skills) || {};
  return Object.keys(skills)
    .filter((name) => SAFE_NAME.test(name) && skills[name] && LEGACY_SOURCES.includes(skills[name].source))
    .sort();
}

module.exports = { legacySkills };

if (require.main === module) {
  let lock = null;
  try {
    lock = JSON.parse(fs.readFileSync(process.argv[2] || 'skills-lock.json', 'utf8'));
  } catch {
    // no lock file or malformed: nothing to report
  }
  for (const name of legacySkills(lock)) console.log(name);
}
