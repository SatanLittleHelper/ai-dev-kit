import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('./merge-codex-config.js', import.meta.url).pathname;
const run = (file, ...ids) => spawnSync('node', [SCRIPT, file, ...ids], { encoding: 'utf8' });
const fresh = (content) => {
  const file = join(mkdtempSync(join(tmpdir(), 'codex-cfg-')), 'config.toml');
  if (content !== undefined) writeFileSync(file, content);
  return file;
};

test('C1: создаёт файл и добавляет включённые плагины', () => {
  const file = fresh();
  assert.equal(run(file, 'kit@ai-dev-kit', 'nestjs-best-practices@ai-dev-kit').status, 0);
  assert.equal(
    readFileSync(file, 'utf8'),
    '[plugins."kit@ai-dev-kit"]\nenabled = true\n\n[plugins."nestjs-best-practices@ai-dev-kit"]\nenabled = true\n',
  );
});

test('C2: существующее содержимое сохраняется, повтор не дублирует секцию', () => {
  const file = fresh('model = "gpt-x"\n\n[plugins."kit@ai-dev-kit"]\nenabled = false\n');
  run(file, 'kit@ai-dev-kit', 'polish@ai-dev-kit');
  const text = readFileSync(file, 'utf8');
  assert.match(text, /^model = "gpt-x"/);
  assert.equal((text.match(/\[plugins\."kit@ai-dev-kit"\]/g) || []).length, 1);
  assert.match(text, /\[plugins\."kit@ai-dev-kit"\]\nenabled = false/);
  assert.match(text, /\[plugins\."polish@ai-dev-kit"\]\nenabled = true/);
});
