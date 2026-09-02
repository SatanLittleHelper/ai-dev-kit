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
3. **Update the rules submodule, if this project has one.** If `.claude/ai-dev-kit` exists (check with `git submodule status .claude/ai-dev-kit` or just `[ -d .claude/ai-dev-kit ]`):
   ```
   git submodule update --remote .claude/ai-dev-kit
   ```
   `CLAUDE.md`'s `@import` of `rules/RULES.md` picks up the new content automatically — no further action needed for Claude Code.
4. **Regenerate `AGENTS.md`, only if the project opted into Codex support.** Check whether `AGENTS.md` contains the marker `<!-- ai-dev-kit:rules:start` — its presence is what "opted in" means (set by `setup.sh`'s prompt or a manual run of the generator), not something to ask about again here. If present:
   ```
   bash .claude/ai-dev-kit/rules/build-agents-md.sh
   ```
   If the marker isn't there, skip this step silently — don't ask the user to opt in as a side effect of an unrelated "update skills" request; that's `setup.sh`'s question to ask, once, at setup time.
5. **Show what changed.** Run `git status --short` and `git diff --stat`; report the changed files to the user (typically `skills-lock.json` and any synced skill files, plus `.claude/ai-dev-kit` and `AGENTS.md` if steps 3–4 ran).
6. **Ask before committing.** Per `rules/base/git-and-commits.md`, `git commit` only runs on explicit user request — never automatically here. Present the diff and ask whether to commit. If the user says yes, follow `rules/base/git-and-commits.md` for message shape (past tense, one line, ticket prefix from `.claude/dev-conventions.json` if the project tracks one).
7. **No-op case.** If nothing in steps 2–4 reported a change, say so plainly — skip the diff and the commit question.
8. **Failure case.** If any command errors (network, registry, etc.), surface its stderr to the user rather than swallowing it or retrying silently.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Running plain `npx skills update` with no flags | Use `-p -y` — restrict to project scope and skip the interactive scope prompt |
| Committing `skills-lock.json`/`AGENTS.md` changes automatically after the update | Ask first, per `rules/base/git-and-commits.md` — commit only on explicit request |
| Running this in a directory with no `skills-lock.json` | Stop and tell the user this project doesn't use `npx skills` |
| Retrying silently on a CLI error | Surface the actual stderr to the user |
| Regenerating `AGENTS.md` when the project never opted into Codex support | Only run the generator if the `ai-dev-kit:rules:start` marker is already present — don't ask again or add it here |
| Skipping `git submodule update --remote` because "update skills" sounds like it's only about `npx skills` | The rules submodule is part of what this project gets from `ai-dev-kit` too — update it in the same pass |
