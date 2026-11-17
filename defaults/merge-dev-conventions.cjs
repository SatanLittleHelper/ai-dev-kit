#!/usr/bin/env node
// Fills in kit defaults in a project's .claude/dev-conventions.json WITHOUT overwriting anything:
// a key that already exists (any value, any type) is left exactly as the project has it; only
// missing keys are added, recursively. Secrets never go through here — the defaults carry only
// the NAME of an env var (provider.envKey), never a key.
//
// Usage: node merge-dev-conventions.cjs <defaults.json> <target dev-conventions.json>
// Prints one line per added key path (or "up to date"). Exit 1 on malformed JSON, target untouched.
const fs = require("fs");
const path = require("path");

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function fillMissing(target, defaults, trail, added) {
  for (const [key, value] of Object.entries(defaults)) {
    const here = [...trail, key];
    if (!(key in target)) {
      target[key] = value;
      added.push(here.join("."));
    } else if (isObj(target[key]) && isObj(value)) {
      fillMissing(target[key], value, here, added);
    }
    // existing non-object value (or type mismatch): the project wins, never overwrite
  }
}

function merge(defaultsPath, targetPath) {
  const defaults = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));
  let target = {};
  if (fs.existsSync(targetPath)) {
    try {
      target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
    } catch (err) {
      throw new Error(`${targetPath} is not valid JSON (${err.message}); fix it and rerun — file left untouched`);
    }
    if (!isObj(target)) throw new Error(`${targetPath} must contain a JSON object; file left untouched`);
  }
  const added = [];
  fillMissing(target, defaults, [], added);
  if (added.length > 0) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(target, null, 2)}\n`);
  }
  return added;
}

module.exports = { merge, fillMissing };

if (require.main === module) {
  const [defaultsPath, targetPath] = process.argv.slice(2);
  if (!defaultsPath || !targetPath) {
    console.error("usage: merge-dev-conventions.cjs <defaults.json> <target dev-conventions.json>");
    process.exit(2);
  }
  try {
    const added = merge(defaultsPath, targetPath);
    console.log(added.length ? added.map((k) => `added ${k}`).join("\n") : "up to date");
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
