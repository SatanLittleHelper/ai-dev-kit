import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { legacySkills } = createRequire(import.meta.url)('./legacy-skills.js');

test('G1: возвращает скиллы кита и двух стековых источников, остальные не трогает', () => {
  const lock = {
    version: 1,
    skills: {
      roadmap: { source: 'SatanLittleHelper/ai-dev-kit' },
      'angular-best-practices': { source: 'alfredoperez/angular-best-practices' },
      'nestjs-best-practices': { source: 'kadajett/agent-nestjs-skills' },
      'third-party': { source: 'someone/else' },
    },
  };
  assert.deepEqual(legacySkills(lock), ['angular-best-practices', 'nestjs-best-practices', 'roadmap']);
});

test('G2: пустой или отсутствующий lock даёт пустой список', () => {
  assert.deepEqual(legacySkills(null), []);
  assert.deepEqual(legacySkills({}), []);
});

test('G3: имена, похожие на флаги или glob, отбрасываются', () => {
  const source = 'SatanLittleHelper/ai-dev-kit';
  const lock = { skills: { '--all': { source }, '-g': { source }, 'a*': { source }, 'good-skill': { source } } };
  assert.deepEqual(legacySkills(lock), ['good-skill']);
});
