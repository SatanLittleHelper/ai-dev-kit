#!/usr/bin/env node
'use strict';
// Идемпотентно вписывает маркерный блок flow-guard в git-хук pre-push, не затирая чужую логику.
// Usage: install-pre-push.js <файл pre-push> <файл с блоком>

const fs = require('fs');
const path = require('path');

const [, , target, blockFile] = process.argv;
if (!target || !blockFile) {
  console.error('Usage: install-pre-push.js <pre-push file> <block file>');
  process.exit(1);
}

const START = '# >>> ai-dev-kit flow-guard >>>';
const END = '# <<< ai-dev-kit flow-guard <<<';
const block = fs.readFileSync(blockFile, 'utf8').trimEnd();

if (!fs.existsSync(target)) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `#!/usr/bin/env bash\n${block}\n`);
  fs.chmodSync(target, 0o755);
  console.log(`-- created ${target} with the flow-guard block`);
  process.exit(0);
}

const text = fs.readFileSync(target, 'utf8');
const start = text.indexOf(START);
const end = text.indexOf(END);

if (start !== -1 && end > start) {
  const next = text.slice(0, start) + block + text.slice(end + END.length);
  if (next === text) {
    console.log(`-- flow-guard block already up to date in ${target}, skipping`);
  } else {
    fs.writeFileSync(target, next);
    console.log(`-- updated the flow-guard block in ${target}`);
  }
  process.exit(0);
}

if (start !== -1) {
  console.error(`-- skipped ${target}: the flow-guard block has no closing marker, fix it manually`);
  process.exit(0);
}

const lines = text.split('\n');
if (!/^#!.*\b(?:ba|z|da|k)?sh\b/.test(lines[0])) {
  console.error(`-- skipped ${target}: not a shell script, add the flow-guard check to it manually`);
  process.exit(0);
}

lines.splice(1, 0, block);
fs.writeFileSync(target, lines.join('\n'));
console.log(`-- added the flow-guard block to ${target}`);
