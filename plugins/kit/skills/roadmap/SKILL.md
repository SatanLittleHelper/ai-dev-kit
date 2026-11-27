---
name: roadmap
description: >-
  Use for anything involving a roadmap (a phased multi-checkpoint plan tracked with markdown
  checkboxes under docs/<feature-slug>/) — creating one for a task too large for a single
  spec/plan ("roadmap"/"дорожная карта", multi-week migration, multi-release rollout, phased
  rewrite), a generic "let's continue the roadmap" request that doesn't say whether that means
  documentation or implementation, taking the next unfinished checkpoint ("возьми следующую
  задачу в роадмапе", "take the next roadmap task", "next roadmap checkpoint"), or batch-drafting
  and validating several of its steps' specs/plans at once ("напиши несколько планов",
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
| Batch-drafting and validating several steps' specs/plans (from this roadmap, or an explicit list of tasks) | `references/batch-plan-validate.md` |
| Fresh default branch, open-PR state overlay (incl. stackable checkpoints), hiding other roadmaps in the branch (shared by all of the above) | `references/sync-and-isolate.md` |

Before continuing existing work, run `node <base>/../../tools/roadmap/cli/main.mts status` and follow `references/sync-and-isolate.md`.

Read only the reference the situation calls for — they all assume this file's storage/naming/state-file conventions as shared background, so don't re-derive them per reference.

**Hard rule, no exceptions:** the roadmap file itself, every design/spec doc, and every implementation plan produced under this skill (directly or via `superpowers:brainstorming` / `superpowers:writing-plans`) is written entirely in Russian — headings, prose, and task descriptions alike — regardless of what language the request came in. Code blocks, identifiers, file paths, and ticket ids stay in their original form. Implementation plans keep the superpowers markup in English (`### Task N: <русское название>` headings — parsed by the `task-brief` script — plus checkboxes and `Step`/`Files`/`Interfaces`/`Global Constraints` labels). A project's own `rules/skills/writing-plans.md` / `rules/skills/brainstorming.md` override, if present, states the same rule — this is not conditional on that file existing.

## Workflow Recipe

A roadmap-sized feature moves through three phases, each handled entirely by one reference here — no separate orchestrator needed:

- **Phase 1 — Roadmap:** `references/writing.md`. Analyzes the feature, decomposes it into checkpoints (Core Principle: the app stays buildable after every step), writes the roadmap. The feature's goals and requirements live in the roadmap's own `Context` section — there is no separate PRD document.
- **Phase 2 — Per-step spec, validated:** `references/batch-plan-validate.md` over the roadmap's checklist, with the per-task drafting mode set to **`brainstorming`, design-only** — no implementation plan is produced yet. Result: for every step, a validated design/spec (`brainstorming`) that also carries the step's requirements and success criteria, reviewed through the Plannotator approval loop (`rules/skills/document-approval.md`, no native Plan Mode).
- **Phase 3 — Implementation plan per step, just-in-time:** `references/executing-checkpoints.md`, invoked when a step is actually picked up for work. It finds the step's approved spec and writes, at that point — not earlier — first the test plan (`rules/skills/writing-test-plans.md`, with its reviewer loop; skipped when the step has no test-worthy layer), then the implementation plan (`superpowers:writing-plans`) that references the test plan's IDs, so both reflect the repo state at the moment work starts, not whatever it looked like when the roadmap was first decomposed.

Do not write every step's implementation plan upfront in Phase 2 — that is what the design-only mode in Phase 2 exists to prevent.

## Storage

- Location: `docs/<feature-slug>/` at the repo root. Git-tracked, kept permanently as migration/rollout history — never `tmp/`, never deleted right after a checkpoint ships.
- Writing here uses Plannotator approval without native Plan Mode, same as `brainstorming`/`writing-plans` (`rules/skills/document-approval.md`).

## Storage Precedence

The step-folder storage defined above (`docs/<feature-slug>/steps/<step-slug>/...`, permanent, git-tracked) takes precedence over any project-level general storage override for `writing-plans`/`brainstorming` (e.g. "save plans/specs to the project root, delete after implementation") **for any artifact that belongs to a roadmap step**. A project's plan/spec storage override still applies as-is to standalone, non-roadmap plans and specs written outside a roadmap step context — this precedence rule only carves out roadmap-step artifacts specifically. `references/writing.md` already states that a project's own conventions win over its defaults when they conflict; this section is the explicit exception to that for step-level artifacts.

## No PRD documents

A roadmap and its steps carry no PRD. Feature-level goals, current/target state, and hard constraints live in the roadmap's `Context` section; a step's requirements and success criteria live in its design/spec (`-design.md`) under a dedicated requirements section. Do not create `*-prd.md` files at either level.

## File naming

| File | Purpose |
|---|---|
| `docs/<feature-slug>/YYYY-MM-DD-<feature-slug>-roadmap.md` | The roadmap itself. Each checkpoint/step is a top-level checkbox: `- [ ] <id> — <short name> (Jira: TBD)`. The id identifies the step and cannot be `TBD`. Optional tags at the end of the line: `(est: ...)` (`## Estimates`), then `(depends: ...)`. |
| `docs/<feature-slug>/roadmap-state.json` | Machine-readable progress state for every checkpoint — see `## State File` below. |
| `docs/<feature-slug>/steps/<step-slug>/YYYY-MM-DD-<step-slug>-design.md` | Step spec — the step's requirements, success criteria, and architectural decision, when it needs one (from `brainstorming`). |
| `docs/<feature-slug>/steps/<step-slug>/YYYY-MM-DD-<ticket>-<name>-tests.md` | Test plan for the step (from `rules/skills/writing-test-plans.md`): what each test verifies, by layer. Absent when the step has no test-worthy layer. |
| `docs/<feature-slug>/steps/<step-slug>/YYYY-MM-DD-<ticket>-<name>.md` | Detailed implementation plan for the step (from `writing-plans`), referencing the test plan's test IDs. |

Each step gets its own folder under `docs/<feature-slug>/steps/`, named by the step's own slug (e.g. `steps/general-information/`) — not a bare number. All of a step's docs (spec, test plan, plan) live together in that folder; a step with no architectural decision to make has only a plan (and test plan), just no `-design.md`.

## State File

`docs/<feature-slug>/roadmap-state.json` tracks progress across the whole roadmap — which checkpoints have a spec, a validated spec, a plan, are implemented, or are closed — so progress doesn't rely on markdown checkboxes alone. Same storage policy as the roadmap itself: git-tracked, kept permanently, never deleted until the roadmap itself is deleted (see "When a roadmap is fully checked off" below).

```json
{
  "feature": "<feature-slug>",
  "roadmapPath": "docs/<feature-slug>/<date>-<feature-slug>-roadmap.md",
  "updatedAt": "<ISO-8601>",
  "steps": [
    {
      "id": "A1",
      "title": "...",
      "ticket": "TBD",
      "dependsOn": [],
      "estimate": {
        "manual": { "min": 1, "max": 3 },
        "agent": { "min": 0.5, "max": 1 },
        "basis": "initial",
        "actualDays": null
      },
      "stepFolder": "docs/<feature-slug>/steps/<step-slug>/",
      "status": "not-started",
      "specPath": null,
      "testPlanPath": null,
      "planPath": null
    }
  ]
}
```

`estimate` is `null` for a step with no estimate (older state files without the field stay valid). See `## Estimates` for its meaning.

`status` is one of, in order: `not-started` → `spec-drafted` → `spec-validated` → `plan-drafted` → `implemented` → `closed`. For a step with no design doc (drafted with `writing-plans` directly, or a step that needs no architectural decision), the `spec-*` stages are skipped — status goes straight from `not-started` to `plan-drafted` with `specPath: null`.

The tool maintains this file: `node <base>/../../tools/roadmap/cli/main.mts init` creates it, `mark` records document progress, `estimate` updates estimates, and `close` closes a step. Status never goes backwards.

## Dependencies

A checkpoint's markdown line may end with a machine-readable dependency tag: `(depends: <id>[, <id>...])`, listing the checkpoints that must be closed first. A bare `<id>` refers to a checkpoint **in the same roadmap**; `<feature-slug>:<id>` refers to a checkpoint in a **neighbouring roadmap** — `<feature-slug>` is the name of that roadmap's `docs/<feature-slug>/` folder. Omit the tag entirely when a checkpoint has no dependency — most checkpoints, especially ones in different steps that just wait on their own design, have none. Other external dependencies (an auth/user prerequisite, a merge of an unrelated PR, etc.) stay as free prose in the checkpoint's own line or in the roadmap's `Context`/`Зависимости от ...` sections.

```markdown
- [ ] 1.1b — [backend] ... (Jira: ACD-59) (depends: 1.1a)
- [ ] A1 — [ui-kit] ... (Jira: TBD) (est: 1–2д / agent: 0.5–1д) (depends: ui-kit-e2e:B1, ui-kit-e2e:B2)
```

The optional `(est: ...)` tag (`## Estimates`) goes before `(depends: ...)`; `depends` stays the last tag.

`docs/<feature-slug>/roadmap-state.json` mirrors the same information machine-readably: every step entry gets a `"dependsOn": string[]` field (array of checkpoint ids, written exactly as in the tag — `"A1"` or `"ui-kit-e2e:B1"`; empty array when there's no dependency) — `references/writing.md` populates it straight from the markdown tags when creating the state file (see `## State File` above).

A checkpoint is **ready to pick up** when it is unchecked (`- [ ]`) and every entry in its `dependsOn` is satisfied. A bare id is satisfied when that step has `status: "closed"` in this roadmap's `roadmap-state.json`. A `<slug>:<id>` entry is resolved against `docs/<slug>/roadmap-state.json` the same way, and:

- if `docs/<slug>/` no longer exists, it is **satisfied** — a fully checked-off roadmap is deleted (see "When a roadmap is fully checked off"), so absence means it finished;
- if the folder exists but has no state file, fall back to the dependency's checkbox in that roadmap's markdown (`- [x]` = satisfied);
- if the state file exists but has no step with that id, the reference is **broken**: treat the checkpoint as blocked and tell the user to fix the tag instead of guessing.

A blocked checkpoint is **stackable** when every unsatisfied dependency is `closed` in the branch of one open PR (or a chain of PRs); it can then be started from that PR's head branch (`references/sync-and-isolate.md`, `references/executing-checkpoints.md`). This doesn't make it ready: on main the dependency stays unsatisfied until the PR merges.

Cross-roadmap references are one-directional and read-only: a checkpoint never edits the other roadmap's files. Multiple checkpoints can be ready at once — that's exactly what makes them safe to parallelize. `references/executing-checkpoints.md` uses this to decide which checkpoint(s) it can offer, instead of always assuming strict top-to-bottom order.

## Estimates

Every checkpoint carries a rough time estimate in two flavours, so the roadmap answers "how long will this take" per step and as a whole. Estimates are deliberately coarse: a range, never a single number.

**Units and scale**

- Unit is a **day** ≈ 6 hours of focused work; tenths allowed (`0.5д`). Written as a range: `1–3д`.
- **manual** — one developer without AI, including writing tests and PR review.
- **agent** — calendar time of the step when worked with an agent, including the human's review and rework (not the agent's raw runtime).
- **Default ceiling: `manual.max ≤ 3д` per step.** A roadmap may set `limit` in its state; `validate` checks that limit. A step whose manual range goes past 3д is cut into several steps (each piece still leaves the app working — Core Principle in `references/writing.md`). Never round an oversized range down to fit and never leave the step uncut; propose the split and recompute the totals. This check runs when decomposing and on every estimate revision below.
- State assumptions (who executes, how familiar the stack is) in the roadmap's `Context` so the ranges can be re-judged later.

**Where it lives**

- Markdown: an optional tag before `(depends: ...)` — `depends` stays the last tag on the line:
  `- [ ] A2 — [backend] ... (Jira: TBD) (est: 1–3д / agent: 0.5–1д) (depends: A1)`.
  Keep the Latin `est:` / `agent:` keys so the tag stays parseable; prose stays Russian.
- `roadmap-state.json`: the step's `estimate` object (`## State File`). It is the source of truth for calculations; the markdown tag mirrors it, same as `dependsOn` mirrors `(depends: ...)`.
  - `basis` — at which point the range was last revised: `initial` → `spec-validated` → `plan-drafted`.
  - `actualDays` — real elapsed working days, written at close-out; stays `null` until then. Only recorded for calibration — no automatic correction factors.

**Totals** — a derived `## Оценка` section in the roadmap document, recomputed whenever any range changes (state file stays per-step only):

```markdown
## Оценка
| | Вручную | С агентом |
|---|---|---|
| Сумма по шагам | 14–26д | 7–13д |
| Критический путь (depends) | 9–16д | 5–9д |
| Осталось (незакрытые шаги) | ... | ... |
Допущения: ...
```

- **Sum** = Σmin–Σmax over all steps. Don't combine errors statistically — plain sum of ranges, marked as rough.
- **Critical path** = the chain of `(depends: ...)` inside this roadmap with the largest total `max`. Cross-roadmap dependencies (`<slug>:<id>`) are excluded; add a line saying so when any exist.
- **Remaining** = the same sums over steps whose `status` is not `closed`.

**Revision**

- After Phase 2 approval and after the implementation plan, re-check the range, update `estimate` (+ `basis`) and the markdown tag, then call `node <base>/../../tools/roadmap/cli/main.mts estimate`.
- On a step split/merge, re-estimate the affected steps and recompute the totals.
- At close-out record `actualDays`; ask the user (`AskUserQuestion`) if it is not obvious from branch dates — never invent it.
- A roadmap with no estimates (older one) keeps working; offer to add them once when it is next touched, don't force it.

## Tool

Use `node <base>/../../tools/roadmap/cli/main.mts <command>`. Responses are JSON; `needs-input` means ask the user with `AskUserQuestion` and repeat with the selected value.

| Command | When | Result |
|---|---|---|
| `create` | Save an approved roadmap | Paths and state |
| `validate` | Check tags, limits and references | Problems or success |
| `init` | Initialise missing state | State path |
| `estimate` | Recalculate tags and totals | Totals |
| `status` | Check readiness and PRs | Step states |
| `pick` | Select a checkpoint | Branch and flow command |
| `mark` | Record documentation progress | Status |
| `close` | Finish a checkpoint | Remaining estimates |
| `tickets` | Draft Jira tickets | Draft path |
| `link` | Apply created Jira keys | Linked steps |

The default ceiling is `manual.max ≤ 3д`; a roadmap may set a different `limit` in `roadmap-state.json` with `create --limit agent:7`. `validate` checks that limit.

## Commit policy

Never commit roadmap/spec/plan files automatically — commit only on the user's explicit request, same as every other artifact.

## When a roadmap is fully checked off

Once every checkbox in a roadmap is `- [x]`, the roadmap file — and its `docs/<feature-slug>/` folder if now empty — is deleted rather than kept as dead weight. See `references/executing-checkpoints.md` for exactly when this fires.
