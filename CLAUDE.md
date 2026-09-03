# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Personal dev-conventions repo (`ai-dev-kit`), consumed by other projects two different ways:

- `skills/` — actual Claude Code skills (`SKILL.md` + `references/`), installed into a consuming project with `npx skills add SatanLittleHelper/ai-dev-kit --skill <name>`.
- `rules/` — plain markdown, NOT skills, wired into a consuming project by adding it as a git submodule and importing one file from the project's own `CLAUDE.md`.

There is no application code, build, lint, or test step here — the repo is markdown content plus two bash scripts (`setup.sh`, `rules/build-agents-md.sh`).

## Architecture: rules vs skills

- `rules/RULES.md` is the single always-on entry point: a consuming project imports it once (`@.claude/ai-dev-kit/rules/RULES.md`), which recursively pulls in `rules/orchestrator.md` plus every always-on file under `rules/base/` and `rules/skills/` via `@import`.
- `rules/orchestrator.md` is the routing table: for a given situation it says which always-on rule already applies (no action needed) vs. which on-demand file or skill needs a deliberate `Read`/invocation.
- **`@import` only resolves inside the always-on chain starting at `RULES.md`** — i.e. when a project's `CLAUDE.md` first loads. A file reached later via `Read` mid-session (any on-demand file — `rules/angular/*`, `rules/nestjs/*`, `rules/skills/executing-plans.md`, etc.) does NOT expand `@` references inside itself; they stay literal text. `rules/angular/index.md` and `rules/nestjs/index.md` are lookup tables meant for `Read`, not `@import` aggregators — reading the index does not pull in the files it lists.
- A convention is deliberately kept as an always-on **rule**, not a skill, when it must be guaranteed present every turn (e.g. `rules/base/git-and-commits.md`'s pre-commit branch check) — an on-demand skill can be forgotten and skipped; an always-on imported file cannot.
- `.claude/dev-conventions.json` in a *consuming* project stores small per-project values routed rules need (currently `ticketPrefix` for commit message prefixes) — read via `rules/orchestrator.md`'s "Project Config" section, never guessed or invented.
- Any rule/skill that produces a markdown artifact (design spec, plan, roadmap, issue draft) must save it only after `ExitPlanMode` approval, never write the real file first and validate after — see `rules/orchestrator.md`'s "Markdown-Generating Skills Require `ExitPlanMode` Gating".

## Commands

Set up a consuming project (idempotent, safe to rerun; installs the `skills` CLI, adds the submodule, wires `CLAUDE.md`, optionally generates `AGENTS.md`, installs `OUR_SKILLS`, and stack-detected best-practices skills):
```bash
curl -fsSL https://raw.githubusercontent.com/SatanLittleHelper/ai-dev-kit/main/setup.sh | bash
```

Regenerate a consuming project's Codex `AGENTS.md` block from the current always-on rules chain (only needed for projects that opted into Codex support):
```bash
bash .claude/ai-dev-kit/rules/build-agents-md.sh
```

Install or update a single skill for local testing without the full setup flow:
```bash
npx skills add SatanLittleHelper/ai-dev-kit --skill <name>
npx skills update
```

## Project rules

- When adding a new skill under `skills/`, add its name to the `OUR_SKILLS` array in `setup.sh` too — that list is hardcoded, not derived from the folder's contents, so a forgotten entry silently excludes the new skill from `setup.sh` installs.
