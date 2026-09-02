---
name: update-project-rules
description: Use when the user wants to refresh this project's ai-dev-kit rules (the .claude/ai-dev-kit submodule, and its generated AGENTS.md if the project opted into Codex support) to the latest published version. Explicit triggers include «обнови правила» / "update rules".
---

# Update Project Rules

## Overview

This developer's rules (`rules/*.md`) live in `SatanLittleHelper/ai-dev-kit` and are pulled into a project as a git submodule at `.claude/ai-dev-kit`, wired into `CLAUDE.md` via `@import`. A source-repo change doesn't reach an installed project until someone updates that submodule there. This skill wraps that sequence — and the companion `AGENTS.md` regeneration for Codex, when the project has opted into it — so it's safe and predictable to invoke on request.

For updating the installed skills themselves (`npx skills update`), see `update-project-skills` instead — a separate skill, deliberately not folded into this one.

## Steps

1. **Scope check.** Confirm `.claude/ai-dev-kit` exists as a submodule in the current project (`git submodule status .claude/ai-dev-kit` succeeds, or just `[ -d .claude/ai-dev-kit ]`). If it doesn't, tell the user this project doesn't have the ai-dev-kit rules submodule and stop — no action.
2. **Update the submodule to the latest commit on its tracked branch:**
   ```
   git submodule update --remote .claude/ai-dev-kit
   ```
   `CLAUDE.md`'s `@import` of `rules/RULES.md` picks up the new content automatically the next time it's loaded — no further action needed for Claude Code itself.
3. **Regenerate `AGENTS.md`, only if the project opted into Codex support.** Check whether `AGENTS.md` contains the marker `<!-- ai-dev-kit:rules:start` — its presence is what "opted in" means (set by `ai-dev-kit`'s `setup.sh` prompt, or a manual run of the generator), not something to ask about again here. If present:
   ```
   bash .claude/ai-dev-kit/rules/build-agents-md.sh
   ```
   If the marker isn't there, skip this step silently — don't ask the user to opt into Codex support as a side effect of an unrelated "update rules" request; that question belongs to `ai-dev-kit`'s `setup.sh`, asked once, at setup time.
4. **Show what changed.** Run `git status --short` and `git diff --stat`; report the changed files to the user (typically `.claude/ai-dev-kit`'s submodule pointer, plus `AGENTS.md` if step 3 ran).
5. **Ask before committing.** Per `rules/base/git-and-commits.md`, `git commit` only runs on explicit user request — never automatically here. Present the diff and ask whether to commit. If the user says yes, follow `rules/base/git-and-commits.md` for message shape (past tense, one line, ticket prefix from `.claude/dev-conventions.json` if the project tracks one) — and the pre-commit branch check from that same file.
6. **No-op case.** If the submodule update reports nothing changed (already at the latest commit) and step 3 didn't run or produced no diff, say so plainly — skip the diff and the commit question.
7. **Failure case.** If any command errors (network, missing submodule init, etc.), surface its actual output to the user rather than swallowing it or retrying silently.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Also running `npx skills update` here because skills come from the same repo | That's `update-project-skills`'s job — keep the two separate, don't fold skill-updating logic back into this skill |
| Regenerating `AGENTS.md` when the project never opted into Codex support | Only run the generator if the `ai-dev-kit:rules:start` marker is already present in `AGENTS.md` — don't ask again or add it here |
| Committing the submodule pointer/`AGENTS.md` changes automatically after updating | Ask first, per `rules/base/git-and-commits.md` — commit only on explicit request, after the branch check and message approval |
| Running this in a project with no `.claude/ai-dev-kit` submodule | Stop and tell the user this project doesn't use the ai-dev-kit rules submodule |
| Retrying silently on a `git submodule update` error | Surface the actual error to the user |
