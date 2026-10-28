# Resuming Roadmap Work

Front door for an ambiguous "let's continue the roadmap" request. Reads the roadmap's actual state, rechecks any logged blockers, then decides — with the user, never alone — whether the next move is documentation (`references/batch-plan-validate.md`) or implementation (`references/executing-checkpoints.md`). Does no drafting or implementation itself.

**REQUIRED BACKGROUND:** `roadmap/SKILL.md` (file locations, state file schema, the three-phase workflow). Hands off to `references/batch-plan-validate.md` (Phase 2) or `references/executing-checkpoints.md` (Phase 3).

Use this reference for a generic "продолжим роадмап"-style request. Not for a request that already names the phase (writing specs → `references/batch-plan-validate.md`; taking the next checkpoint → `references/executing-checkpoints.md`).

## Process

### 1. Find the roadmap

Same rule as `references/executing-checkpoints.md` step 1: named feature → `docs/<slug>/*-roadmap.md`; otherwise glob `docs/*/*-roadmap.md`; zero matches → report and stop; multiple matches → `AskUserQuestion`, one option per roadmap.

### 2. Read state

- `docs/<slug>/roadmap-state.json` — per-step `status` (`roadmap/SKILL.md` → `## State File`). Missing file → fall back to reading each step's checkbox and `steps/<step-slug>/` folder contents directly.
- `tmp/reports/batch-plan-queue.md` — Phase 2 queue, if one exists for this roadmap.

### 3. Recheck blockers before anything else

For every queue row with `status: blocked`, surface its `notes` reason and ask the user via `AskUserQuestion` whether it's resolved now (one question per blocked task, or one multi-select if several). Never assume a blocker is stale or still open on your own.

- **Resolved** → capture the answer, set the row back to `queued`, and fold the resolution into `notes` (e.g. `resolved: <answer>`) so the next `references/batch-plan-validate.md` Phase 1 pass drafts with that context instead of re-blocking on the same question.
- **Still open** → leave as `blocked`, exclude it from this run's proposal below.

### 4. Classify every unchecked step

Using `roadmap-state.json` status (`roadmap/SKILL.md` order: `not-started → spec-drafted → spec-validated → plan-drafted → implemented → closed`):

- **Doc-complete** — `spec-validated` or later. The design exists and is validated; ready for a plan.
- **Doc-in-progress** — anything before `spec-validated` (including `not-started`).

### 5. Propose, don't assume

- **No step is doc-complete yet** → tell the user documentation is still open on N steps, then `AskUserQuestion`: keep drafting/validating designs in batch (`references/batch-plan-validate.md`) vs. take a single step straight into work (`references/executing-checkpoints.md`). The second option is always available, even on a brand-new roadmap: `references/executing-checkpoints.md` step 4 writes the missing step plan itself, and the step's design doc is optional there.
- **Some doc-complete, some not** → report both counts, then `AskUserQuestion`: continue documentation on the remaining steps (`references/batch-plan-validate.md`) vs. start implementation on a step (`references/executing-checkpoints.md`) — a doc-complete one, or any other ready step the user prefers to take without waiting for its docs.
- **Every remaining step is doc-complete** → for the next doc-complete step, `AskUserQuestion`: write the implementation plan only (`rules/skills/writing-plans.md`, standalone) vs. write the plan and implement it (`references/executing-checkpoints.md`, which writes the plan itself as part of its own flow — don't pre-write one before handing off, that would duplicate step 4 of that reference).

Whichever answer comes back, hand off to that reference/skill and stop — this reference's job ends at the handoff.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Jumping straight to `references/executing-checkpoints.md` on a generic "continue" request | Check doc-completion first — implementation is only one of two possible next steps |
| Silently treating a `blocked` queue row as still blocked (or as auto-resolved) | Always ask the user via `AskUserQuestion`; never assume either way |
| Offering "write plan / write plan and implement" while a step is still doc-in-progress | That choice only appears once the step is `spec-validated` or later |
| Writing the implementation plan yourself before handing off to `references/executing-checkpoints.md` | Let that reference write its own plan in its own step 4 — handing off means stopping, not pre-doing its work |
| Treating this reference as replacing `references/batch-plan-validate.md`/`references/executing-checkpoints.md` | It only decides which one to call — all actual drafting/implementation logic still lives in them |
