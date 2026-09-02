---
name: roadmap
description: >-
  Use for anything involving a roadmap (a phased multi-checkpoint plan tracked with markdown
  checkboxes under docs/<feature-slug>/) — creating one for a task too large for a single
  spec/plan ("roadmap"/"дорожная карта", multi-week migration, multi-release rollout, phased
  rewrite), a generic "let's continue the roadmap" request that doesn't say whether that means
  documentation or implementation, taking the next unfinished checkpoint ("возьми следующую
  задачу в роадмапе", "take the next roadmap task", "next roadmap checkpoint"), or batch-drafting
  and validating several of its steps' PRDs/specs/plans at once ("напиши несколько планов",
  "пройтись по роадмапу", "на все задачи роадмапа"). This skill is the single entry point for
  all of that — it reads the situation and routes to the right reference file itself.
---

# Roadmap

## Overview

A roadmap turns one oversized idea into a **persistent, checkpointed decomposition**: a document with checkable steps, each step small enough to ship independently without leaving the app broken, each step traceable to a ticket. It is not a bigger spec — a spec describes one coherent change; a roadmap describes an ordered sequence of changes and the state between them.

This skill is the single trigger for everything roadmap-related. It owns storage/naming/state-file conventions (below — shared by every reference file) and routes to the right reference for the actual process:

| Situation | Read |
|---|---|
| Writing a brand-new roadmap | `references/writing.md` |
| Generic "let's continue the roadmap" — unclear whether that means more documentation or starting implementation | `references/resuming-work.md` |
| User names a specific checkpoint/task and asks to take/start it | `references/executing-checkpoints.md` |
| Batch-drafting and validating several steps' PRDs/specs/plans (from this roadmap, or an explicit list of tasks) | `references/batch-plan-validate.md` |

Read only the reference the situation calls for — they all assume this file's storage/naming/state-file conventions as shared background, so don't re-derive them per reference.

## Workflow Recipe

A roadmap-sized feature moves through three phases, each handled entirely by one reference here — no separate orchestrator needed:

- **Phase 1 — Roadmap:** `references/writing.md`. Analyzes the feature, decomposes it into checkpoints (Core Principle: the app stays buildable after every step), writes the roadmap and the feature-level PRD.
- **Phase 2 — Per-step PRD + spec, validated:** `references/batch-plan-validate.md` over the roadmap's checklist, with the per-task drafting mode set to **`brainstorming`, design-only** — no implementation plan is produced yet. Result: for every step, a validated step-level PRD (`writing-prd`) and a validated design/spec (`brainstorming`), both reviewed through the standard `EnterPlanMode → ExitPlanMode → Plannotator` loop.
- **Phase 3 — Implementation plan per step, just-in-time:** `references/executing-checkpoints.md`, invoked when a step is actually picked up for work. It finds the step's approved PRD+spec and writes the implementation plan (`superpowers:writing-plans`) at that point — not earlier — so the plan reflects the repo state at the moment work starts, not whatever it looked like when the roadmap was first decomposed.

Do not write every step's implementation plan upfront in Phase 2 — that is what the design-only mode in Phase 2 exists to prevent.

## Storage

- Location: `docs/<feature-slug>/` at the repo root. Git-tracked, kept permanently as migration/rollout history — never `tmp/`, never deleted right after a checkpoint ships.
- Writing here requires native Plan Mode first, same as `brainstorming`/`writing-plans`/`writing-prd`.

## Storage Precedence

The step-folder storage defined above (`docs/<feature-slug>/steps/<step-slug>/...`, permanent, git-tracked) takes precedence over any project-level general storage override for `writing-plans`/`brainstorming` (e.g. "save plans/specs to the project root, delete after implementation") **for any artifact that belongs to a roadmap step**. A project's plan/spec storage override still applies as-is to standalone, non-roadmap plans and specs written outside a roadmap step context — this precedence rule only carves out roadmap-step artifacts specifically. `references/writing.md` already states that a project's own conventions win over its defaults when they conflict; this section is the explicit exception to that for step-level artifacts.

## Feature-level PRD (required)

Every roadmap has exactly one feature-level PRD, written with `writing-prd` and stored at `docs/<feature-slug>/YYYY-MM-DD-<feature-slug>-prd.md`. The roadmap file links to it from its own context/intro section. **Write the roadmap first, then the feature-level PRD based on it** — the roadmap is the source of truth for scope/decomposition; the PRD documents the target state and requirements the already-written roadmap describes. A roadmap with steps but no linked feature-level PRD is incomplete.

## File naming

| File | Purpose |
|---|---|
| `docs/<feature-slug>/YYYY-MM-DD-<feature-slug>-roadmap.md` | The roadmap itself. Each checkpoint/step is a top-level checkbox: `- [ ] <TICKET> <short name>`. Use the project's real issue-tracker prefix (e.g. `SCB-NNN`); before a ticket exists, use the literal placeholder `TBD` in its place. Links to the feature-level PRD below. |
| `docs/<feature-slug>/YYYY-MM-DD-<feature-slug>-prd.md` | Feature-level PRD (see above), format per `writing-prd`. |
| `docs/<feature-slug>/roadmap-state.json` | Machine-readable progress state for every checkpoint — see `## State File` below. |
| `docs/<feature-slug>/steps/<step-slug>/YYYY-MM-DD-<step-slug>-prd.md` | Step-level PRD — scope, requirements, and success criteria for this one step, per `writing-prd`. |
| `docs/<feature-slug>/steps/<step-slug>/YYYY-MM-DD-<step-slug>-design.md` | Step spec — the step's own architectural decision, when it needs one (from `brainstorming`). |
| `docs/<feature-slug>/steps/<step-slug>/YYYY-MM-DD-<ticket>-<name>.md` | Detailed implementation plan for the step (from `writing-plans`). |

Each step gets its own folder under `docs/<feature-slug>/steps/`, named by the step's own slug (e.g. `steps/general-information/`) — not a bare number. All three of a step's docs (PRD, spec, plan) live together in that folder; a step with no architectural decision to make still gets a PRD and a plan, just no `-design.md`.

## State File

`docs/<feature-slug>/roadmap-state.json` tracks progress across the whole roadmap — which checkpoints have a PRD, a validated spec, a plan, are implemented, or are closed — so progress doesn't rely on markdown checkboxes alone. Same storage policy as the roadmap itself: git-tracked, kept permanently, never deleted until the roadmap itself is deleted (see "When a roadmap is fully checked off" below).

```json
{
  "feature": "<feature-slug>",
  "roadmapPath": "docs/<feature-slug>/<date>-<feature-slug>-roadmap.md",
  "featurePrdPath": "docs/<feature-slug>/<date>-<feature-slug>-prd.md",
  "updatedAt": "<ISO-8601>",
  "steps": [
    {
      "id": "A1",
      "title": "...",
      "ticket": "TBD",
      "dependsOn": [],
      "stepFolder": "docs/<feature-slug>/steps/<step-slug>/",
      "status": "not-started",
      "prdPath": null,
      "specPath": null,
      "planPath": null
    }
  ]
}
```

`status` is one of, in order: `not-started` → `prd-drafted` → `spec-drafted` → `spec-validated` → `plan-drafted` → `implemented` → `closed`. For a step whose Phase 2 drafting skill was `writing-plans` directly (not design-only), the `spec-*` stages are skipped — status goes straight from `prd-drafted` to `plan-drafted`.

Who updates the file, and when:

- `references/writing.md` creates it right after saving the roadmap and the feature-level PRD — one entry per checkpoint, `status: "not-started"`, `stepFolder` filled in only for checkpoints that got a folder immediately (most stay flat until picked up in Phase 2/3).
- `references/batch-plan-validate.md` updates it after every phase transition for a task: Phase 1 PRD drafted → `prd-drafted` + `prdPath`; Phase 1 design/plan drafted → `spec-drafted` + `specPath`, or `plan-drafted` + `planPath` if `writing-plans` was chosen directly; Phase 2 approval → `spec-validated` (or stays `plan-drafted` if a plan was validated directly). Also fills `stepFolder` if it was still empty.
- `references/executing-checkpoints.md` updates it when a step is picked up (Phase 3): after writing the implementation plan → `plan-drafted` + `planPath`; after implementation's final verification passes → `implemented`; at close-out (checkbox ticked, plan file deleted) → `closed`, `planPath: null`.

## Dependencies

A checkpoint's markdown line may end with a machine-readable dependency tag: `(depends: <id>[, <id>...])`, listing the ids of other checkpoints **in the same roadmap** that must be closed first. Omit the tag entirely when a checkpoint has no internal dependency — most checkpoints, especially ones in different steps that just wait on their own design, have none. External dependencies (another roadmap, an auth/user prerequisite, etc.) stay as free prose in the checkpoint's own line or in the roadmap's `Context`/`Зависимости от ...` sections — `(depends: ...)` only ever references ids inside this same roadmap.

```markdown
- [ ] 1.1b — [backend] ... (Jira: ACD-59) (depends: 1.1a)
```

`docs/<feature-slug>/roadmap-state.json` mirrors the same information machine-readably: every step entry gets a `"dependsOn": string[]` field (array of checkpoint ids, empty array when there's no internal dependency) — `references/writing.md` populates it straight from the markdown tags when creating the state file (see `## State File` above).

A checkpoint is **ready to pick up** when it is unchecked (`- [ ]`) and every id in its `dependsOn` has `status: "closed"` in `roadmap-state.json`. Multiple checkpoints can be ready at once — that's exactly what makes them safe to parallelize. `references/executing-checkpoints.md` uses this to decide which checkpoint(s) it can offer, instead of always assuming strict top-to-bottom order.

## Commit policy

Never commit roadmap/spec/plan files automatically — commit only on the user's explicit request, same as every other artifact.

## When a roadmap is fully checked off

Once every checkbox in a roadmap is `- [x]`, the roadmap file — and its `docs/<feature-slug>/` folder if now empty — is deleted rather than kept as dead weight. See `references/executing-checkpoints.md` for exactly when this fires.
