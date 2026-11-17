---
name: update-ai-dev-kit
description: Use when the user wants to bring this project's ai-dev-kit up to date — rules (the .claude/ai-dev-kit submodule and its generated AGENTS.md), installed skills including newly published ones, and mods. Explicit triggers include «обнови скиллы» / «обнови правила» / «обнови кит» / "update skills" / "update rules" / "update ai-dev-kit".
---

# Update AI Dev Kit

## Overview

This developer's kit is published from one repo (`SatanLittleHelper/ai-dev-kit`) and reaches a project four ways:

- **rules** — git submodule `.claude/ai-dev-kit`, wired into `CLAUDE.md` via `@import`;
- **skills** — installed with `npx skills add`, pinned in `skills-lock.json`;
- **mods** — Claude Code plugins from the `ai-dev-kit` marketplace, enabled in `.claude/settings.json`;
- **workflow dependencies** — official Superpowers and Plannotator plugins plus the Plannotator CLI, declared in `dependencies/plugins.json` and managed by `dependencies/install.sh`;
- **defaults for `.claude/dev-conventions.json`** — kit-provided values, currently the Codex backend profiles `codex` and `local` (`defaults/dev-conventions.defaults.json`), merged in by `defaults/install-dev-conventions.sh`.

A source-repo change reaches none of them by itself. And `npx skills update` only refreshes skills that are already installed — a skill published after the project was set up is never added. This skill brings all five up to date and installs what is new. The composition of the kit is read from the freshly updated submodule (`skills/*`, `.claude-plugin/marketplace.json`, `dependencies/plugins.json`), never from `setup.sh`'s hardcoded lists, which can lag behind.

Any trigger («обнови скиллы», «обнови правила», «обнови кит») runs the whole sequence: this also authorizes refreshing the declared external workflow dependencies.

## Steps

Run from the project root. A part whose prerequisite is missing is skipped, and the report says so.

1. **Scope check.** The rules and mods parts need the submodule `.claude/ai-dev-kit` (`[ -d .claude/ai-dev-kit ]`); the skills part needs `skills-lock.json`. If neither exists, tell the user this project doesn't use ai-dev-kit and stop.
2. **Rules — update the submodule first** (every later step reads the new content):
   ```
   git submodule update --init --remote .claude/ai-dev-kit
   ```
   `CLAUDE.md`'s `@import` of `rules/RULES.md` picks the new content up the next time it loads.
3. **AGENTS.md, only if the project opted into Codex.** If `AGENTS.md` contains the marker `<!-- ai-dev-kit:rules:start`, run `bash .claude/ai-dev-kit/rules/build-agents-md.sh`. No marker → skip silently; the opt-in question belongs to `setup.sh`, asked once.
   The script rewrites the block unformatted (e.g. markdown tables lose their column alignment), so a diff of dozens of lines may be pure whitespace. If the project formats markdown with Prettier (a `.prettierrc*` file or `prettier` in `package.json`), run `npx prettier --write AGENTS.md` right after the script, so the diff shows only real content changes. No Prettier in the project → leave the script's output as is.
4. **Skills** (needs `skills-lock.json`):
   - Refresh the installed ones, project-scoped and non-interactive:
     ```
     npx skills update -p -y
     ```
     `-p` never touches global `~/.claude/skills`; `-y` skips the scope prompt so it doesn't hang.
   - Find the new ones: folder names in `.claude/ai-dev-kit/skills/` minus the keys of `skills-lock.json` whose `"source"` is `SatanLittleHelper/ai-dev-kit`. Skills from other sources are never touched. Install all missing ones in one call, without asking:
     ```
     npx skills add SatanLittleHelper/ai-dev-kit --skill <name>... -a claude-code --yes
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
6. **External workflow dependencies** (needs the updated submodule and Claude Code CLI):
   ```
   bash .claude/ai-dev-kit/dependencies/install.sh --update
   ```
   Installs missing official Superpowers/Plannotator plugins, refreshes marketplaces and plugins, and installs/updates the Plannotator binary with the official minimal installer. Preserves explicitly disabled plugins and existing project settings. This deliberately manages only dependencies declared in `dependencies/plugins.json`: an exception to the restriction on unrelated skill sources, not permission to update arbitrary plugins. If the installer or Claude CLI is missing, report it and offer installation/repair per `rules/base/workflow-dependencies.md`. In Codex this only sets up Claude Code dependencies, not Codex integrations; use host-specific instructions in that rule when needed.
7. **Default dev-conventions** (needs the updated submodule):
   ```
   bash .claude/ai-dev-kit/defaults/install-dev-conventions.sh
   ```
   Adds the kit's default values (the Codex profiles `codex` and `local`) to `.claude/dev-conventions.json`, creating the file if needed. It only adds keys that are missing and never overwrites anything the project already has, so rerunning is safe; its output lists the added key paths (`up to date` when nothing was missing). It writes **no secrets**: the `local` profile only names the env var `LOCAL_LLM_API_KEY`. When the output shows `local` was just added (`added codex`, `added codex.profiles` or `added codex.profiles.local`), tell the user to fill in the `YOUR-…` placeholders (`model`, `provider.baseUrl`) of `codex.profiles.local` in `.claude/dev-conventions.json` and to export `LOCAL_LLM_API_KEY` (the token) in their own shell before choosing that profile; until the placeholders are replaced the profile is unconfigured and is not offered. If the script reports malformed JSON, show the error and leave the file alone.
8. **Report.** Run `git status --short` and `git diff --stat`. Report what was refreshed and, as a separate list, what was newly added (skills, mods, workflow dependencies, default dev-conventions keys). Include CLI/plugin updates even when they produce no Git diff; say that Claude Code must restart to load plugins. Nothing changed → say so plainly and skip the commit question.
9. **Ask before committing.** Per `rules/base/git-and-commits.md`, `git commit` runs only on explicit user request. Present the diff (typically the submodule pointer, `skills-lock.json`, synced skill files, `.claude/settings.json`, `.claude/dev-conventions.json`, `AGENTS.md`) and ask. If the user agrees, follow `rules/base/git-and-commits.md` for message shape and its pre-commit branch check.
10. **Failure case.** If any command errors (network, registry, uninitialised submodule), show its actual output to the user; don't swallow it or retry silently.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Running only `npx skills update` and calling it done | It never adds new skills — also install the missing ones from the updated submodule's `skills/` |
| Taking the skill list from `setup.sh`'s `OUR_SKILLS` | That list is hardcoded and can lag; read `.claude/ai-dev-kit/skills/` after updating the submodule |
| Finding new skills before updating the submodule | Update the submodule first, otherwise brand-new skills aren't in `skills/` yet |
| Running plain `npx skills update` with no flags | Use `-p -y` — project scope, no interactive prompt |
| Installing or removing arbitrary third-party skills | Only touch kit-owned skills; manage declared workflow plugins separately via `dependencies/install.sh` |
| Regenerating `AGENTS.md` when the project never opted into Codex | Only if the `ai-dev-kit:rules:start` marker is already present |
| Leaving `AGENTS.md` as `build-agents-md.sh` wrote it in a Prettier project | The script drops formatting (table alignment); run `npx prettier --write AGENTS.md` so the diff is not noise |
| Overwriting the project's own profile settings with the kit defaults | The installer only adds missing keys; never edit existing ones to match the defaults |
| Writing an API key anywhere | Defaults carry only `envKey` (a variable name); the user exports the key themselves |
| Committing the changes automatically | Ask first, per `rules/base/git-and-commits.md` |
| Forgetting the restart note after a mod update | A mod reloads only on a new session — tell the user |
| Retrying silently on a CLI error | Surface the actual error |
