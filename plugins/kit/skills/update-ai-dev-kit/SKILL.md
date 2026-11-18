---
name: update-ai-dev-kit
description: Use when the user wants to bring this project's ai-dev-kit up to date — rules (the .claude/ai-dev-kit submodule and its generated AGENTS.md), the kit plugins (skills, mods, stack best-practices) including newly published ones, and workflow dependencies. Explicit triggers include «обнови скиллы» / «обнови правила» / «обнови кит» / "update skills" / "update rules" / "update ai-dev-kit".
---

# Update AI Dev Kit

## Overview

The kit is published from one repo (`SatanLittleHelper/ai-dev-kit`) and reaches a project in four ways:

- **rules** — git submodule `.claude/ai-dev-kit`, wired into `CLAUDE.md` via `@import`;
- **plugins** — marketplace `ai-dev-kit` (`.claude-plugin/marketplace.json`) enabled in the project's `.claude/settings.json` with `autoUpdate: true`: the `kit` plugin (all kit skills, named `kit:<skill>`), the mods (`polish`, `pr-flow`) and, by stack, `angular-best-practices` / `nestjs-best-practices`. For Codex the same plugins come from `.agents/plugins/marketplace.json` and are enabled in `.codex/config.toml`;
- **workflow dependencies** — official Superpowers and Plannotator plugins plus the Plannotator CLI, declared in `dependencies/plugins.json` and managed by `dependencies/install.sh`;
- **defaults for `.claude/dev-conventions.json`** — kit-provided values (the Codex backend profiles `codex` and `local`), merged in by `defaults/install-dev-conventions.sh`.

Plugins refresh themselves (Claude Code: after the first message of a session, applied in the next one; Codex: at startup), but the submodule does not, and a plugin published after the project was set up is not enabled by itself. This skill brings everything up to date at once. The kit's composition is read from the freshly updated submodule (`.claude-plugin/marketplace.json`, `dependencies/plugins.json`), never from a hardcoded list.

Any trigger («обнови скиллы», «обнови правила», «обнови кит») runs the whole sequence: this also authorizes refreshing the declared external workflow dependencies.

## Steps

Run from the project root. A part whose prerequisite is missing is skipped, and the report says so.

1. **Scope check.** Everything needs the submodule `.claude/ai-dev-kit` (`[ -d .claude/ai-dev-kit ]`). If it does not exist, tell the user this project doesn't use ai-dev-kit and stop.
2. **Rules — update the submodule first** (every later step reads the new content):
   ```
   git submodule update --init --remote .claude/ai-dev-kit
   ```
   `CLAUDE.md`'s `@import` of `rules/RULES.md` picks the new content up the next time it loads.
3. **AGENTS.md, only if the project opted into Codex.** If `AGENTS.md` contains the marker `<!-- ai-dev-kit:rules:start`, run `bash .claude/ai-dev-kit/rules/build-agents-md.sh`. No marker → skip silently; the opt-in question belongs to `setup.sh`, asked once.
   The script rewrites the block unformatted (e.g. markdown tables lose their column alignment), so a diff of dozens of lines may be pure whitespace. If the project formats markdown with Prettier (a `.prettierrc*` file or `prettier` in `package.json`), run `npx prettier --write AGENTS.md` right after the script, so the diff shows only real content changes.
4. **Old delivery channel.** Skills that an earlier setup installed with `npx skills` and that the kit now ships as plugins would appear twice. Remove them:
   ```
   bash .claude/ai-dev-kit/mods/migrate-legacy-skills.sh
   ```
   It touches only the kit's own skills and the two stack best-practices listed in `skills-lock.json`; skills from other sources stay. If `skills-lock.json` also lists `update-project-skills` or `update-project-rules` (replaced long ago), mention in the report that `npx skills remove update-project-skills update-project-rules` cleans them up. Don't remove them yourself.
5. **Plugins (Claude Code).**
   - The kit's plugins are `plugins[].name` in `.claude/ai-dev-kit/.claude-plugin/marketplace.json`. Enable and install every one **except** `angular-best-practices` and `nestjs-best-practices`; those two only when `package.json` contains `"@angular/core"` / `"@nestjs/core"` respectively (or they are already enabled in `.claude/settings.json`). The script is idempotent: it adds missing plugins, sets `autoUpdate: true` on the marketplace entry when the field is absent, and leaves explicitly disabled plugins disabled:
     ```
     bash .claude/ai-dev-kit/mods/install-mods.sh <plugin>...
     ```
   - Refresh right away instead of waiting for autoUpdate:
     ```
     claude plugin marketplace update ai-dev-kit
     claude plugin update <plugin>@ai-dev-kit
     ```
   - An updated plugin takes effect only after the Claude Code session restarts (or `/reload-plugins`) — say so in the report.
6. **Plugins (Codex), only if the project opted in** (`.codex/config.toml` contains `@ai-dev-kit"]` sections). Run `bash .claude/ai-dev-kit/mods/install-codex-plugins.sh kit [angular-best-practices] [nestjs-best-practices]` with the same stack rule. Installing kit also installs Codex PR-flow and preserves an explicit project opt-out. Then run `codex plugin marketplace upgrade ai-dev-kit`. Restart the session and review changed hooks when prompted. No `codex` CLI → report it and skip.
7. **Hooks.** Register the kit-sync hook if it is missing (idempotent; an already registered hook is kept as is): `bash .claude/ai-dev-kit/rules/hooks/install-kit-sync.sh` (add `--codex` if `.codex/hooks.json` exists). In Codex the developer must approve the hook once via `/hooks`.
8. **External workflow dependencies** (needs Claude Code CLI):
   ```
   bash .claude/ai-dev-kit/dependencies/install.sh --update
   ```
   Installs missing official Superpowers/Plannotator plugins, refreshes marketplaces and plugins, and installs/updates the Plannotator binary. Preserves explicitly disabled plugins and existing project settings. It manages only dependencies declared in `dependencies/plugins.json`. If the installer or Claude CLI is missing, report it and offer installation/repair per `rules/base/workflow-dependencies.md`.
9. **Default dev-conventions:**
   ```
   bash .claude/ai-dev-kit/defaults/install-dev-conventions.sh
   ```
   Adds only missing keys, never overwrites, writes no secrets. When the output shows `local` was just added (`added codex`, `added codex.profiles` or `added codex.profiles.local`), tell the user to fill in the `YOUR-…` placeholders (`model`, `provider.baseUrl`) of `codex.profiles.local` in `.claude/dev-conventions.json` and to export `LOCAL_LLM_API_KEY` in their own shell; until then the profile is unconfigured and is not offered. If the script reports malformed JSON, show the error and leave the file alone.
10. **Report.** Run `git status --short` and `git diff --stat`. Report what was refreshed and, separately, what was newly added (plugins, workflow dependencies, default dev-conventions keys, removed legacy skills). Include CLI/plugin updates even when they produce no Git diff; say that Claude Code must restart to load plugins. Nothing changed → say so plainly and skip the commit question.
11. **Ask before committing.** Per `rules/base/git-and-commits.md`, `git commit` runs only on explicit user request. Present the diff (typically the submodule pointer, `skills-lock.json`, `.claude/settings.json`, `.codex/*`, `.claude/dev-conventions.json`, `AGENTS.md`) and ask. If the user agrees, follow `rules/base/git-and-commits.md` for message shape and its pre-commit branch check.
12. **Failure case.** If any command errors (network, registry, uninitialised submodule), show its actual output to the user; don't swallow it or retry silently.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Installing skills with `npx skills add` | Skills ship in the `kit` plugin; use `install-mods.sh kit` |
| Taking the plugin list from `setup.sh` | Read `.claude-plugin/marketplace.json` of the updated submodule |
| Finding the plugin list before updating the submodule | Update the submodule first, otherwise brand-new plugins aren't in the marketplace file yet |
| Enabling `angular-best-practices` / `nestjs-best-practices` in every project | Only when the stack matches (or they are already enabled) |
| Leaving old `npx skills` copies next to the plugin | Run `mods/migrate-legacy-skills.sh` — otherwise `roadmap` and `kit:roadmap` both load |
| Installing or removing arbitrary third-party plugins | Only the kit's marketplace plugins and the dependencies in `dependencies/plugins.json` |
| Regenerating `AGENTS.md` when the project never opted into Codex | Only if the `ai-dev-kit:rules:start` marker is already present |
| Leaving `AGENTS.md` as `build-agents-md.sh` wrote it in a Prettier project | The script drops formatting (table alignment); run `npx prettier --write AGENTS.md` so the diff is not noise |
