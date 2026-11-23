---
name: simplify
description: Use when the work is implemented and the changes need a simplification and reuse pass before review — "упрости изменения", "проверь на переиспользование", "simplify the changes", or when the task-flow stage `simplify` is reached in an agent that has no native /simplify (Codex, opencode). In Claude Code run the native /simplify instead. Fixes findings silently, saves a short summary to a file, never commits.
---

# Simplify

## Overview

A copy of the host's native `/simplify` for agents that do not have one. One pass over the changes of the current task: simplification, reuse, efficiency. Findings are fixed on the spot with no report to the user; only a short summary is saved to a file. Review for correctness is not part of this skill: it is a separate step (`superpowers:requesting-code-review`).

In Claude Code use the native `/simplify` and do not run this skill.

## Input

- Optional argument: the path of the summary file. Default: `tmp/simplify/report.md` (create the folder; `tmp/` is not committed).
- Scope: the changes of this task.
  1. Base revision: `git merge-base HEAD origin/<default>`, where the default branch is `git symbolic-ref --short refs/remotes/origin/HEAD` without the `origin/` prefix. If `origin/HEAD` is not set, try local `main`, then `master`. If none exists, or `merge-base` fails (no common ancestor), the base cannot be determined: fall back to `HEAD` (only uncommitted work is in scope) and write that reason in the summary together with «коммиты задачи не проверены».
  2. Scope: everything the task changed since the base — `git diff <base>` (commits of the branch and uncommitted edits together) plus the untracked files (`git ls-files --others --exclude-standard`).
  3. Scope empty with a determined base: write the summary «Изменений нет» and stop. Scope empty after the fallback to `HEAD`: write «Изменений в рабочем дереве нет; база не определена, коммиты задачи не проверены» — never «Изменений нет».

## The pass

Read the whole diff and the code around it, then fix directly, in the files, whatever fits one of these:

- **Reuse:** a new helper, type, constant or component duplicates one that already exists in the repository — use the existing one (search before concluding it does not exist).
- **Simplification:** needless branches, parameters, wrappers, intermediate variables, dead code and speculative options added by this change; names that do not say what the thing is.
- **Efficiency:** repeated work in a loop, needless sequential calls that can be parallel, reading or fetching more than is used.
- **Project rules:** the rules of `CLAUDE.md` / `AGENTS.md` and the rules of the stack the change touches (read them before editing).

Touch only the lines this change added or changed, and what they directly require. Behavior must stay the same; run the narrowest test that covers an edited file when one exists.

## Rules

- No report in the chat, no list of findings, no questions about what to fix. One line at the end: the summary path and the number of fixes.
- Do not look for bugs and do not review behavior: that is the next step. A defect noticed on the way goes into the summary under «Замечено», without a fix.
- Never commit, stage, stash or push.
- Never widen the scope: files the change did not touch stay as they are, unless a fix requires it.
- After the fixes, run the narrowest check that covers them (the scoped test or type-check); the full build and test pass belongs to the task's own final verification, not to this skill.

## Summary file

Written in Russian, at most 20 lines:

```markdown
# Simplify: <ветка или задача>

Правок: <число>
- <файл>: <что изменено и зачем, одна строка>

Замечено (не исправлялось)
- <файл:строка> <дефект или вопрос; раздел опускается, если пунктов нет>

Проверка: <команда и результат>
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| Running this skill in Claude Code | Use the native `/simplify` there |
| Reviewing for bugs and fixing them here | Out of scope: note it under «Замечено», review is the next step |
| Writing the findings into the chat | Fix silently, keep one line in the chat, the rest in the summary file |
| Refactoring files the change did not touch | Scope is the diff only |
| Committing the fixes | Never; commits are the user's |
