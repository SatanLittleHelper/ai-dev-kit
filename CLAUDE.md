# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Personal dev-conventions repo (`ai-dev-kit`), consumed by other projects three different ways:

- `plugins/kit/` — the `kit` plugin: actual skills (`plugins/kit/skills/<name>/SKILL.md` + `references/`), delivered by the marketplace `ai-dev-kit` for Claude Code (`.claude-plugin/marketplace.json`) and Codex (`.agents/plugins/marketplace.json`); skills are named `kit:<name>`. No `version` anywhere: updates follow the commit SHA.
- `rules/` — plain markdown, NOT skills, wired into a consuming project by adding it as a git submodule and importing one file from the project's own `CLAUDE.md`.
- `mods/` — Claude Code plugins with UI and hooks (TypeScript), listed in `.claude-plugin/marketplace.json`; `setup.sh` enables them in a consuming project's `.claude/settings.json` via `mods/install-mods.sh`.
- `defaults/` — kit-provided default values merged into a consuming project's `.claude/dev-conventions.json` (missing keys only, never overwriting, never secrets) by `defaults/install-dev-conventions.sh`, which `setup.sh` and the `update-ai-dev-kit` skill both call; currently the Codex backend profiles `codex` and `local`.
- `plugins/kit/tools/` — TypeScript tools with a CLI that skills call; one copy of each tool inside the `kit` plugin (no dependencies in the repo; Node 24 runs the `.mts` files directly). A skill calls a tool in place: `node <base>/../../tools/<name>/cli/main.mts`, where `<base>` is its «Base directory for this skill». Currently `flow/` (state machine and CLI of the task flow: stage order, `tmp/flow/<id>.json` state, `start` / `status` / `skip`; no dependencies), `forgejo/` (Forgejo/Gitea API and CLI for the `forgejo-pr-dashboard`, `forgejo-pr-feedback` and `roadmap` skills) and `jira/` (Playwright CLI `login` / `status` / `create` for `jira-writer`; `playwright-core` is installed at runtime into `~/.config/ai-dev-kit/jira/`, in the repo it is only a dev-dependency for the tests). The only extra copy is the Forgejo CLI inside the separate Codex plugin `plugins/pr-flow-codex/`, which cannot see the kit files.

There is no application build or lint step here — the repo is markdown content, bash and Node scripts (`setup.sh`, `rules/build-agents-md.sh`, `rules/hooks/*`, `mods/*.sh`, `mods/*.js`, `defaults/install-dev-conventions.sh`) and the mods in `mods/`. The scripts have tests (`node --test`, see Commands). A mod's tests run with `claude plugin test mods/<name>`; validate with `claude plugin validate mods/<name>` and `claude plugin validate .` (marketplace).

## Architecture: rules vs skills

- `rules/RULES.md` is the single always-on entry point: a consuming project imports it once (`@.claude/ai-dev-kit/rules/RULES.md`), which recursively pulls in the compact `core.md`, `orchestrator.md`, and universal TypeScript/workflow rules via `@import`.
- `rules/orchestrator.md` is the routing table: for a given situation it says which always-on rule already applies (no action needed) vs. which on-demand file or skill needs a deliberate `Read`/invocation.
- **`@import` only resolves inside the always-on chain starting at `RULES.md`** — i.e. when a project's `CLAUDE.md` first loads. A file reached later via `Read` mid-session (any on-demand file — `rules/angular/*`, `rules/nestjs/*`, `rules/skills/executing-plans.md`, etc.) does NOT expand `@` references inside itself; they stay literal text. `rules/angular/index.md` and `rules/nestjs/index.md` are lookup tables meant for `Read`, not `@import` aggregators — reading the index does not pull in the files it lists.
- Critical behavior keeps a short always-on guardrail in `rules/core.md`; the detailed rule is read immediately before the corresponding action (for example, `git-and-commits.md` before a commit).
- `.claude/dev-conventions.json` in a *consuming* project stores small per-project values routed rules need (`ticketPrefix` for commit message prefixes, `testing` for `testing-changes`, `codex` for the model backend profiles of `codex-implement` and `doc-review`) — read via `rules/orchestrator.md`'s "Project Config" section, never guessed or invented.
- Any rule/skill that produces a markdown artifact (design spec, plan, roadmap, issue draft) must save it to the target path only after Plannotator `approved`, never write the real file first and validate after — see `rules/core.md` and `rules/skills/document-approval.md` (approval without native Plan Mode).

## Commands

Set up a consuming project (idempotent, safe to rerun; adds the submodule, wires `CLAUDE.md`, registers the commit-rules and kit-sync hooks, removes old `npx skills` copies, enables the kit plugins — skills, mods and stack-detected best-practices — with `autoUpdate`, and optionally sets up Codex):
```bash
curl -fsSL https://raw.githubusercontent.com/SatanLittleHelper/ai-dev-kit/main/setup.sh | bash
```

Regenerate a consuming project's Codex `AGENTS.md` block from the current always-on rules chain (only needed for projects that opted into Codex support):
```bash
bash .claude/ai-dev-kit/rules/build-agents-md.sh
```

Check the plugin layout and marketplaces, and run every test of the kit's scripts:
```bash
node --test 'tests/*.test.mjs' 'mods/*.test.mjs' 'rules/hooks/*.test.mjs'
claude plugin validate . && claude plugin validate plugins/kit
```

Run the tests of the Forgejo tool, or re-copy its CLI into the Codex plugin after changing `plugins/kit/tools/forgejo/src` or `plugins/kit/tools/forgejo/cli`:
```bash
node --test 'plugins/kit/tools/forgejo/test/*.test.mts'
bash plugins/kit/tools/forgejo/sync-codex.sh
```

Run the tests of the Jira tool (needs Google Chrome and a one-time `npm install --prefix plugins/kit/tools/jira`); `create --dry-run` fills the form in a visible window without saving, for checking the scenario against a real Jira:
```bash
npm install --prefix plugins/kit/tools/jira
node --test 'plugins/kit/tools/jira/test/*.test.mts'
```

Run the tests of the flow tool (task-flow stage state machine; no dependencies, Node 24):
```bash
node --test 'plugins/kit/tools/flow/test/*.test.mts'
```

## Project rules

- A new skill is just a folder in `plugins/kit/skills/` with a `SKILL.md` whose `name` equals the folder name (`tests/layout.test.mjs` checks it); there is nothing to register in `setup.sh`, the skill reaches the `kit` plugin by itself.
- When adding a new mod under `mods/`, add it to `.claude-plugin/marketplace.json` (entry `name` equal to the mod's `plugin.json` name) and to the `BASE_PLUGINS` array in `setup.sh` — both lists are hardcoded, a forgotten entry silently excludes the mod. Never set `version` in a plugin manifest or marketplace entry: it freezes updates until the string changes.
- Entries that Codex must see (`.agents/plugins/marketplace.json`, external entries in `.claude-plugin/marketplace.json`) use `./path`, `url` or `git-subdir` sources — never `github`, which Codex skips (`tests/layout.test.mjs` checks it). External plugins are pinned by full `sha`; bumping it is a deliberate change.
- Every tool lives in `plugins/kit/tools/<name>/` and skills call it in place (`node <base>/../../tools/<name>/cli/main.mts`); never copy a tool into a skill's `scripts/`. The only exception is the Codex PR-flow plugin (`plugins/pr-flow-codex/forgejo/`), a separate plugin that cannot see the kit: after changing `plugins/kit/tools/forgejo/src` or `cli`, run `bash plugins/kit/tools/forgejo/sync-codex.sh` and keep the generated copy in the change; `plugins/kit/tools/forgejo/test/sync.test.mts` checks it.
