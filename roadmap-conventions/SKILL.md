---
name: roadmap-conventions
description: Use when authoring, locating, or updating a roadmap file (a phased multi-checkpoint plan tracked with markdown checkboxes, e.g. under docs/<feature-slug>/) in any repository — governs storage location, file naming, the feature-level PRD, and per-step folder placement (step PRD/spec/plan).
---

# Roadmap Conventions

## Overview

Cross-project conventions for where roadmaps and their nested docs live. Layered on top of `superpowers:writing-roadmaps` (authoring process), `writing-prd` (PRD content/format), and consumed by `executing-roadmap-checkpoints` (picking and finishing tasks from an existing roadmap).

## Workflow Recipe

A roadmap-sized feature moves through three phases, each handled entirely by an existing skill — no separate orchestrator skill exists or is needed:

- **Phase 1 — Roadmap:** `superpowers:writing-roadmaps` as-is. Analyzes the feature, decomposes it into checkpoints (Core Principle: the app stays buildable after every step), writes the roadmap and the feature-level PRD.
- **Phase 2 — Per-step PRD + spec, validated:** `batch-plan-validate` over the roadmap's checklist, with the per-task drafting skill set to **`brainstorming`, design-only** (see `batch-plan-validate` → Input) — no implementation plan is produced yet. Result: for every step, a validated step-level PRD (`writing-prd`) and a validated design/spec (`brainstorming`), both reviewed through the standard `EnterPlanMode → ExitPlanMode → Plannotator` loop.
- **Phase 3 — Implementation plan per step, just-in-time:** `executing-roadmap-checkpoints` as-is, invoked when a step is actually picked up for work. It finds the step's approved PRD+spec and writes the implementation plan (`superpowers:writing-plans`) at that point — not earlier — so the plan reflects the repo state at the moment work starts, not whatever it looked like when the roadmap was first decomposed.

Do not write every step's implementation plan upfront in Phase 2 — that is what the design-only mode in Phase 2 exists to prevent.

## Storage

- Location: `docs/<feature-slug>/` at the repo root. Git-tracked, kept permanently as migration/rollout history — never `tmp/`, never deleted right after a checkpoint ships.
- Writing here requires native Plan Mode first, same as `brainstorming`/`writing-plans`/`writing-prd`.

## Storage Precedence

The step-folder storage defined above (`docs/<feature-slug>/steps/<step-slug>/...`, permanent, git-tracked) takes precedence over any project-level general storage override for `writing-plans`/`brainstorming` (e.g. "save plans/specs to the project root, delete after implementation") **for any artifact that belongs to a roadmap step**. A project's plan/spec storage override still applies as-is to standalone, non-roadmap plans and specs written outside a roadmap step context — this precedence rule only carves out roadmap-step artifacts specifically. `writing-roadmaps` already states that a project's own conventions win over its defaults when they conflict; this section is the explicit exception to that for step-level artifacts.

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

- `writing-roadmaps` creates it right after saving the roadmap and the feature-level PRD — one entry per checkpoint, `status: "not-started"`, `stepFolder` filled in only for checkpoints that got a folder immediately (most stay flat until picked up in Phase 2/3).
- `batch-plan-validate` updates it after every phase transition for a task: Phase 1 PRD drafted → `prd-drafted` + `prdPath`; Phase 1 design/plan drafted → `spec-drafted` + `specPath`, or `plan-drafted` + `planPath` if `writing-plans` was chosen directly; Phase 2 approval → `spec-validated` (or stays `plan-drafted` if a plan was validated directly). Also fills `stepFolder` if it was still empty.
- `executing-roadmap-checkpoints` updates it when a step is picked up (Phase 3): after writing the implementation plan → `plan-drafted` + `planPath`; after implementation's final verification passes → `implemented`; at close-out (checkbox ticked, plan file deleted) → `closed`, `planPath: null`.

## Dependencies

A checkpoint's markdown line may end with a machine-readable dependency tag: `(depends: <id>[, <id>...])`, listing the ids of other checkpoints **in the same roadmap** that must be closed first. Omit the tag entirely when a checkpoint has no internal dependency — most checkpoints, especially ones in different steps that just wait on their own design, have none. External dependencies (another roadmap, an auth/user prerequisite, etc.) stay as free prose in the checkpoint's own line or in the roadmap's `Context`/`Зависимости от ...` sections — `(depends: ...)` only ever references ids inside this same roadmap.

```markdown
- [ ] 1.1b — [backend] ... (Jira: ACD-59) (depends: 1.1a)
```

`docs/<feature-slug>/roadmap-state.json` mirrors the same information machine-readably: every step entry gets a `"dependsOn": string[]` field (array of checkpoint ids, empty array when there's no internal dependency) — `writing-roadmaps` populates it straight from the markdown tags when creating the state file (see `## State File` above).

A checkpoint is **ready to pick up** when it is unchecked (`- [ ]`) and every id in its `dependsOn` has `status: "closed"` in `roadmap-state.json`. Multiple checkpoints can be ready at once — that's exactly what makes them safe to parallelize. `executing-roadmap-checkpoints` uses this to decide which checkpoint(s) it can offer, instead of always assuming strict top-to-bottom order.

## Commit policy

Never commit roadmap/spec/plan files automatically — commit only on the user's explicit request, same as every other artifact.

## When a roadmap is fully checked off

Once every checkbox in a roadmap is `- [x]`, the roadmap file — and its `docs/<feature-slug>/` folder if now empty — is deleted rather than kept as dead weight. See `executing-roadmap-checkpoints` for exactly when this fires.
