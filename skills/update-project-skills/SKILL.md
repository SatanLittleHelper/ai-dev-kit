---
name: update-project-skills
description: Use when the user wants to refresh installed skills to their latest published versions in the current project. Explicit triggers include «обнови скиллы» / "update skills".
---

# Update Project Skills

## Overview

This developer's skills are published from a source repo (`SatanLittleHelper/ai-dev-kit`, skills live under its `skills/` folder) and installed into projects via `npx skills add`, pinned in each project's `skills-lock.json`. A source-repo change doesn't reach an installed project until someone runs `npx skills update` there. This skill wraps that sequence so it's safe and predictable to invoke on request.

## Steps

1. **Scope check.** Confirm `skills-lock.json` exists in the current project root. If it doesn't, tell the user this project doesn't manage skills via `npx skills` and stop — no action.
2. **Run the update, project-scoped and non-interactive:**
   ```
   npx skills update -p -y
   ```
   `-p` restricts the update to project skills (never touches global `~/.claude/skills`); `-y` skips the CLI's scope prompt so it doesn't hang waiting for input.
3. **Show what changed.** Run `git status --short` and `git diff --stat`; report the changed files to the user (typically `skills-lock.json`, plus any synced skill files).
4. **Ask before committing.** Per `rules/base/git-and-commits.md`, `git commit` only runs on explicit user request — never automatically here. Present the diff and ask whether to commit. If the user says yes, follow `rules/base/git-and-commits.md` for message shape (past tense, one line, ticket prefix from `.claude/dev-conventions.json` if the project tracks one).
5. **No-op case.** If `npx skills update` reports nothing changed, say so plainly — skip the diff and the commit question.
6. **Failure case.** If the command errors (network, registry, etc.), surface the CLI's stderr to the user rather than swallowing it or retrying silently.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Running plain `npx skills update` with no flags | Use `-p -y` — restrict to project scope and skip the interactive scope prompt |
| Committing `skills-lock.json` changes automatically after the update | Ask first, per `rules/base/git-and-commits.md` — commit only on explicit request |
| Running this in a directory with no `skills-lock.json` | Stop and tell the user this project doesn't use `npx skills` |
| Retrying silently on a CLI error | Surface the actual stderr to the user |
