#!/usr/bin/env node
'use strict';
// Хук Claude Code и Codex для task-flow: печатает статус задачи при старте сессии (SessionStart), не даёт закончить
// ход посреди стадии (Stop) и не даёт отправить ветку или создать PR без закрытых стадий simplify, check, local-test,
// review (PreToolUse на Bash). Вся логика решений — в команде `flow guard`; скрипт только переводит её ответ в формат
// хуков. Лежит в submodule и регистрируется в настройках проекта (см. install-flow-guard.sh). Любой сбой — тихое «разрешено».

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const FLOW = '.claude/ai-dev-kit/plugins/kit/tools/flow/cli/main.mts';
const TIMEOUT_MS = 8000;
// Распознаются команды, как их пишут в PR-flow проекта. Совпадение засчитывается, только если команда начинается вне кавычек
// (текст в `echo "git push"` командой не считается); кавычки внутри аргументов (путь к CLI, URL) читаются как обычно.
const PUSH = /(^|[;&|(]\s*|\s)git(?:\s+-[Cc]\s+\S+|\s+--?[\w-]+(?:=\S+)?)*\s+push\b/g;
const PR = /(^|[;&|(]\s*|\s)(?:gh\s+pr\s+create|tea\s+pulls?\s+create|node\s+["']?\S*(?:main|forgejo)\.mts["']?\s+pr\s+create)\b/g;
const CURL_PR = /(^|[;&|(]\s*|\s)curl\b(?=[^;&|\n]*\/repos\/\S+\/pulls(?:[\s"']|$))(?=[^;&|\n]*(?:-X\s*POST|\s-d\s|--data))/g;

function insideQuotes(text, index) {
  let quote = '';
  for (let i = 0; i < index; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    }
  }
  return quote !== '';
}

function firstRun(pattern, command) {
  for (const match of command.matchAll(pattern)) {
    if (!insideQuotes(command, match.index + match[1].length)) return match;
  }
  return null;
}

// Ветки, которые затронет push: источник и назначение каждого refspec после имени remote; null — текущая ветка (HEAD или refspec нет).
function pushBranches(rest) {
  const words = rest.split(/[;&|\n]/)[0].trim().split(/\s+/).filter(Boolean).map((word) => word.replace(/^["']|["']$/g, '')).filter((word) => !word.startsWith('-'));
  const names = new Set();
  for (const spec of words.slice(1)) {
    for (const part of spec.replace(/^\+/, '').split(':')) {
      if (part) names.add(part === 'HEAD' ? null : part.replace(/^refs\/heads\//, ''));
    }
  }
  return names.size ? [...names] : [null];
}

function readEvent() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function repoRoot(cwd) {
  const run = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return run.status === 0 ? run.stdout.trim() : null;
}

// Ответ `flow guard` или null, если flow недоступен или ответил не по контракту.
function guard(root, args) {
  const flow = path.join(root, FLOW);
  if (!fs.existsSync(flow)) return null;

  const run = spawnSync(process.execPath, [flow, 'guard', ...args], { cwd: root, encoding: 'utf8', timeout: TIMEOUT_MS });
  if (run.error) return null;

  try {
    const answer = JSON.parse(run.stdout);
    if (!answer || answer.result !== 'guard') return null;
    // Согласованные пары: код 0 с разрешением, код 3 с отказом и текстом причины; всё остальное — сбой.
    if (run.status === 0 && answer.decision === 'allow') return answer;
    if (run.status === 3 && answer.decision === 'deny' && typeof answer.message === 'string' && answer.message) return answer;
    return null;
  } catch {
    return null;
  }
}

const print = (value) => process.stdout.write(JSON.stringify(value));

function classify(command) {
  const push = firstRun(PUSH, command);
  if (push) return { kind: 'push', branches: pushBranches(command.slice(push.index + push[0].length)) };
  if (firstRun(PR, command) || firstRun(CURL_PR, command)) return { kind: 'pr', branches: [null] };
  return null;
}

function main() {
  const event = readEvent();
  if (!event || typeof event !== 'object') return;

  const root = repoRoot(typeof event.cwd === 'string' && event.cwd ? event.cwd : process.cwd());
  if (!root) return;

  const name = event.hook_event_name;
  if (name === 'SessionStart') {
    const answer = guard(root, ['session-start']);
    if (answer && answer.message) print({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: answer.message } });
  } else if (name === 'Stop') {
    const answer = guard(root, event.stop_hook_active ? ['stop', '--stop-active'] : ['stop']);
    if (answer && answer.decision === 'deny') print({ decision: 'block', reason: answer.message });
  } else if (name === 'PreToolUse') {
    const command = event.tool_input && event.tool_input.command;
    const found = typeof command === 'string' ? classify(command) : null;
    if (!found) return;

    const reasons = new Set();
    for (const branch of found.branches) {
      const answer = guard(root, branch ? [found.kind, '--branch', branch] : [found.kind]);
      if (answer && answer.decision === 'deny') reasons.add(answer.message);
    }
    if (reasons.size) {
      print({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: [...reasons].join('\n') } });
    }
  }
}

try {
  main();
} catch {
  // хук не должен ломать работу агента
}
