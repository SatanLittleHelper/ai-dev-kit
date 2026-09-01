---
name: repo-workflow-conventions
description: Use when deciding where a file belongs in a repository (shared rule vs. personal note, tmp/ artifact vs. tracked file), or when creating a branch or writing a commit message. Explicit triggers include "сделай коммит" / "make a commit", "закоммить" / "commit this", "сделай ветку" / "create a branch".
---

# Repo Workflow Conventions

## Overview

This developer's personal conventions for repository hygiene: where team-shared vs. personal-only files live, where ephemeral workflow artifacts go, and how branches/commits are structured. Independent of stack — applies to any git repository.

## Quick Reference

| Concern | Rule |
|---|---|
| Personal note vs. shared rule | `*.local.md` (gitignored) vs. plain `*.md` (tracked, team-shared) |
| Where a personal note lives | Same path as its shared counterpart, `.local.md` before the extension — or topic-named if there's no counterpart |
| Ephemeral workflow artifacts (reports, reviews, logs) | Typed `tmp/` subfolders — never the repo root or `.git/` |
| Committing to `main` | Never — always branch first, even for a one-line fix |
| When `git commit` runs | Only on explicit user request — never automatically after a task or plan |
| Commits per feature | One, at the end — no intermediate commits per task |
| Commit message | Past tense, one line, no body, no co-author trailer |

## Shared Rules vs. Local Notes

Two tiers of files can coexist in the same conventions directory:

- **Shared** — plain `*.md`, tracked in git, applies to the whole team.
- **Local** — `*.local.md`, gitignored, personal to one developer. Same idea as a root-level `*.local.md` override file, extended to any subfolder.

**Naming:** a local note with a shared counterpart takes the same path with `.local.md` before the extension (`rules/commits.md` → `rules/commits.local.md`); one with no counterpart uses a topic-based name directly.

**Not auto-loaded by default.** A team-wide auto-load mechanism (e.g. an `@import`-style directive) only takes tracked, shared paths — a gitignored personal file can't be a team-wide auto-load target, since every developer's copy differs. Read a `*.local.md` file explicitly when it's relevant, rather than expecting it preloaded. A root-level `*.local.md` override file is usually the one exception, picked up by filename convention rather than an explicit directive — and it can itself opt certain personal notes into auto-loading for that one developer, without affecting the team-wide config.

**Ambiguous cases:** if it's unclear whether a fact belongs in a shared rule or a personal note, ask before deciding — there's no single fixed signal (beyond an explicit "remember this for the team" vs. "just for me") to tell them apart automatically.

**Subagents don't get local notes.** Don't pass a `*.local.md` file's contents into an implementer/reviewer subagent's prompt as if it were project convention — subagents act on behalf of the whole team/repository. Only include it if the user explicitly asks for that specific note to apply to the current task.

## Ephemeral Workflow Artifacts

When using a multi-step workflow (planning, subagent-driven implementation, plan execution), route service files by type instead of dropping them wherever convenient:

- **Plans and specs go wherever the planning skill that produced them defaults to** (e.g. `docs/superpowers/plans/`, `docs/superpowers/specs/`) — don't override it.
- Everything else — reports, review packages, build/debug logs — goes in **typed `tmp/` subfolders** (`tmp/reports/`, `tmp/reviews/`, `tmp/logs/`, or whatever taxonomy fits the workflow), never `.git/`, the bare repo root, or an external temp directory.

**Cleanup:** once a plan is fully implemented, verified, and no longer needs review, delete its artifacts from `tmp/` and the plan/spec file itself — unless the user explicitly asked to keep them. A stale plan/spec file sitting around after the feature shipped is clutter, not documentation.

## Git: Branching

**Never commit directly to `main`** (or whatever the trunk branch is called) — always create and switch to a feature/fix branch first, even for a one-line fix. If a commit lands on the trunk by mistake, branch off it and reset the trunk back to its remote tracking ref (safe as long as it wasn't pushed).

**Release branches:** `r<YY>.<Q>.<NN>` (`YY` — last two digits of the year, `Q` — quarter 1–4, `NN` — two-digit index from `01`). Example: `r26.1.01`. **Release tags** (first final commit in a release branch): `<release-number>t` — e.g. `r26.1.01t`. **Hotfix branches:** `<release-number>-hf<NNN>` (`NNN` — two-digit index from `01`) — e.g. `r26.1.01-hf01`.

## Git: Commits

- **Never automatic.** `git commit` runs only on explicit user request — not after a task, not after a whole plan, not as a workflow-skill default. A plan document must not contain commit steps as part of its tasks.
- **One commit per feature.** No intermediate commits after individual plan tasks — a single commit at the end bundles the whole feature's changes.
- **Implementer subagents never commit.** Explicitly forbid `git commit` in an implementer subagent's prompt; it leaves changes uncommitted for the orchestrating agent/user to handle.
- **Message shape:** past tense, one line, no body/bullets, no `Co-Authored-By` trailer. State what was done ("Added…", "Fixed…"), not an imperative ("Add…", "Fix…").
- **Ticket-prefixed format, when the project tracks one:** `[<PREFIX>-NNN] type(scope): Прошедшее время, заглавная буква` — e.g. `[SCB-123] feat(bot-gateway): Added...`. The prefix comes from `.claude/dev-conventions.json`'s `ticketPrefix` (see `project-orchestrator`, which reads this file and passes the value along) — never guess or invent a ticket number yourself; if the config is missing and the project clearly uses ticket prefixes, ask the user rather than fabricating one. Release/hotfix branches sometimes use `[branch-name] …` instead of `type(scope)`. Projects with no ticket tracker just skip the prefix.

## Documentation Language

Two tiers, split by audience:

- **Rules** — internal convention/rule files (anything under a `rules`-style conventions folder, a skill's own `SKILL.md`, or a workflow-overrides section of a root instructions file) — write in English, independent of whatever language you actually speak with the user. These are instructions consumed by the agent, not by a human reader.
- **Docs** — reader-facing documentation (README, `docs/`-style project documentation, PRDs, specs, design docs, roadmaps) — write in Russian. These are meant for the (Russian-speaking) human to read.

**Exception — trigger phrases:** when a rule defines a phrase that must be recognized in the user's actual input (a skill-activation trigger, a remember-this keyword), keep that phrase in the language it was originally given in and add an English duplicate alongside it — never translate away the literal phrase, since that breaks matching against real user input. Example: «давай подумаем» / "let's think about this", not just the English translation.

## Common Mistakes

| Mistake | Fix |
|---|---|
| A personal scratch note committed as a plain `*.md` | Rename to `*.local.md` and confirm it's actually gitignored |
| A review/report file dropped in the repo root or `.git/` | Move to the right typed `tmp/` subfolder |
| A finished plan/spec file left around after the feature shipped | Delete it once implemented and verified |
| `git commit` run automatically after finishing a plan task | Only commit when the user explicitly asks |
| A multi-task plan gets a commit per task | Squash the workflow into one commit at the very end |
| Commit subject in imperative mood ("Add logging") | Past tense ("Added logging") |
| Inventing a ticket number for the commit prefix | Read it from `.claude/dev-conventions.json` via `project-orchestrator`, or ask — never fabricate |
| A trigger phrase translated into English inside a rule file | Keep the original-language phrase, add the English duplicate alongside it |
| Reader-facing docs (README, PRD, spec) written in English | Rules stay English, but docs are for the human reader — write them in Russian |
