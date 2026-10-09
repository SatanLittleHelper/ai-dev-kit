---
name: update-ai-dev-kit
description: Use when the user wants to bring this project's ai-dev-kit up to date — rules (the .claude/ai-dev-kit submodule and its generated AGENTS.md), installed skills including newly published ones, and mods. Explicit triggers include «обнови скиллы» / «обнови правила» / «обнови кит» / "update skills" / "update rules" / "update ai-dev-kit".
---

# Update AI Dev Kit

## Overview

This developer's kit is published from one repo (`SatanLittleHelper/ai-dev-kit`) and reaches a project three ways:

- **rules** — git submodule `.claude/ai-dev-kit`, wired into `CLAUDE.md` via `@import`;
- **skills** — installed with `npx skills add`, pinned in `skills-lock.json`;
- **mods** — Claude Code plugins from the `ai-dev-kit` marketplace, enabled in `.claude/settings.json`.

A source-repo change reaches none of them by itself. And `npx skills update` only refreshes skills that are already installed — a skill published after the project was set up is never added. This skill brings all three up to date and installs what is new. The composition of the kit is read from the freshly updated submodule (`skills/*`, `.claude-plugin/marketplace.json`), never from `setup.sh`'s hardcoded lists, which can lag behind.

Any trigger («обнови скиллы», «обнови правила», «обнови кит») runs the whole sequence: the three parts come from one repo and are meant to stay in step.

## Steps

Run from the project root. A part whose prerequisite is missing is skipped, and the report says so.

1. **Scope check.** The rules and mods parts need the submodule `.claude/ai-dev-kit` (`[ -d .claude/ai-dev-kit ]`); the skills part needs `skills-lock.json`. If neither exists, tell the user this project doesn't use ai-dev-kit and stop.
2. **Rules — update the submodule first** (every later step reads the new content):
   ```
   git submodule update --init --remote .claude/ai-dev-kit
   ```
   `CLAUDE.md`'s `@import` of `rules/RULES.md` picks the new content up the next time it loads.
3. **AGENTS.md, only if the project opted into Codex.** If `AGENTS.md` contains the marker `<!-- ai-dev-kit:rules:start`, run `bash .claude/ai-dev-kit/rules/build-agents-md.sh`. No marker → skip silently; the opt-in question belongs to `setup.sh`, asked once.
4. **Skills** (needs `skills-lock.json`):
   - Refresh the installed ones, project-scoped and non-interactive:
     ```
     npx skills update -p -y
     ```
     `-p` never touches global `~/.claude/skills`; `-y` skips the scope prompt so it doesn't hang.
   - Find the new ones: folder names in `.claude/ai-dev-kit/skills/` minus the keys of `skills-lock.json` whose `"source"` is `SatanLittleHelper/ai-dev-kit`. Skills from other sources are never touched. Install all missing ones in one call, without asking:
     ```
     npx skills add SatanLittleHelper/ai-dev-kit --skill <name>... --yes
     ```
   - If `skills-lock.json` lists `update-project-skills` or `update-project-rules` (the two skills this one replaced), mention in the report that `npx skills remove update-project-skills update-project-rules` cleans them up. Don't remove them yourself.
5. **Mods** (needs the submodule):
   - The mods are `plugins[].name` in `.claude/ai-dev-kit/.claude-plugin/marketplace.json`. Enable and install all of them — idempotent, adds the new ones and leaves existing ones as they are:
     ```
     bash .claude/ai-dev-kit/mods/install-mods.sh <mod>...
     ```
   - Refresh the already installed ones:
     ```
     claude plugin marketplace update ai-dev-kit
     claude plugin update <mod>@ai-dev-kit
     ```
   - An updated mod takes effect only after the Claude Code session restarts — say so in the report.
6. **Report.** Run `git status --short` and `git diff --stat`. Report what was refreshed and, as a separate list, what was newly added (skills, mods). Nothing changed → say so plainly and skip the commit question.
7. **Ask before committing.** Per `rules/base/git-and-commits.md`, `git commit` runs only on explicit user request. Present the diff (typically the submodule pointer, `skills-lock.json`, synced skill files, `.claude/settings.json`, `AGENTS.md`) and ask. If the user agrees, follow `rules/base/git-and-commits.md` for message shape and its pre-commit branch check.
8. **Failure case.** If any command errors (network, registry, uninitialised submodule), show its actual output to the user; don't swallow it or retry silently.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Running only `npx skills update` and calling it done | It never adds new skills — also install the missing ones from the updated submodule's `skills/` |
| Taking the skill list from `setup.sh`'s `OUR_SKILLS` | That list is hardcoded and can lag; read `.claude/ai-dev-kit/skills/` after updating the submodule |
| Finding new skills before updating the submodule | Update the submodule first, otherwise brand-new skills aren't in `skills/` yet |
| Running plain `npx skills update` with no flags | Use `-p -y` — project scope, no interactive prompt |
| Installing or removing skills from other sources | Only touch skills whose `source` is `SatanLittleHelper/ai-dev-kit` |
| Regenerating `AGENTS.md` when the project never opted into Codex | Only if the `ai-dev-kit:rules:start` marker is already present |
| Committing the changes automatically | Ask first, per `rules/base/git-and-commits.md` |
| Forgetting the restart note after a mod update | A mod reloads only on a new session — tell the user |
| Retrying silently on a CLI error | Surface the actual error |
