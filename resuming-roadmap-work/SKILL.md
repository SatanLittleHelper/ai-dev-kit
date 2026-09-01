---
name: resuming-roadmap-work
description: Use when the user gives a generic instruction to pick roadmap work back up without saying whether that means documentation or implementation — triggers include "хочу продолжить работу над роадмапом", "давай продолжим по роадмапу", "let's continue with the roadmap", "continue roadmap work", "what's next on the roadmap", "чем дальше заниматься по роадмапу". Not for a request that already names the phase (writing specs → batch-plan-validate; taking the next checkpoint → executing-roadmap-checkpoints).
---

# Resuming Roadmap Work

## Overview

Front door for an ambiguous "let's continue the roadmap" request. Reads the roadmap's actual state, rechecks any logged blockers, then decides — with the user, never alone — whether the next move is documentation (`batch-plan-validate`) or implementation (`executing-roadmap-checkpoints`). Does no drafting or implementation itself.

**REQUIRED BACKGROUND:** `roadmap-conventions` (file locations, state file schema, the three-phase workflow). Hands off to `batch-plan-validate` (Phase 2) or `executing-roadmap-checkpoints` (Phase 3).

## Process

### 1. Find the roadmap

Same rule as `executing-roadmap-checkpoints` step 1: named feature → `docs/<slug>/*-roadmap.md`; otherwise glob `docs/*/*-roadmap.md`; zero matches → report and stop; multiple matches → `AskUserQuestion`, one option per roadmap.

### 2. Read state

- `docs/<slug>/roadmap-state.json` — per-step `status` (`roadmap-conventions` → `## State File`). Missing file → fall back to reading each step's checkbox and `steps/<step-slug>/` folder contents directly.
- `tmp/reports/batch-plan-queue.md` — Phase 2 queue, if one exists for this roadmap.

### 3. Recheck blockers before anything else

For every queue row with `status: blocked`, surface its `notes` reason and ask the user via `AskUserQuestion` whether it's resolved now (one question per blocked task, or one multi-select if several). Never assume a blocker is stale or still open on your own.

- **Resolved** → capture the answer, set the row back to `queued`, and fold the resolution into `notes` (e.g. `resolved: <answer>`) so the next `batch-plan-validate` Phase 1 pass drafts with that context instead of re-blocking on the same question.
- **Still open** → leave as `blocked`, exclude it from this run's proposal below.

### 4. Classify every unchecked step

Using `roadmap-state.json` status (`roadmap-conventions` order: `not-started → prd-drafted → spec-drafted → spec-validated → plan-drafted → implemented → closed`):

- **Doc-complete** — `spec-validated` or later. PRD + design both exist and are validated; ready for a plan.
- **Doc-in-progress** — anything before `spec-validated` (including `not-started`).

### 5. Propose, don't assume

- **No step is doc-complete yet** → tell the user documentation is still open on N steps, propose `batch-plan-validate` to keep drafting/validating PRDs+designs. No implementation option offered until at least one step is doc-complete.
- **Some doc-complete, some not** → report both counts, then `AskUserQuestion`: continue documentation on the remaining steps (`batch-plan-validate`) vs. start implementation on a doc-complete one (`executing-roadmap-checkpoints`).
- **Every remaining step is doc-complete** → for the next doc-complete step, `AskUserQuestion`: write the implementation plan only (`writing-plans-conventions`, standalone) vs. write the plan and implement it (`executing-roadmap-checkpoints`, which writes the plan itself as part of its own flow — don't pre-write one before handing off, that would duplicate step 4 of that skill).

Whichever answer comes back, hand off to that skill and stop — this skill's job ends at the handoff.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Jumping straight to `executing-roadmap-checkpoints` on a generic "continue" request | Check doc-completion first — implementation is only one of two possible next steps |
| Silently treating a `blocked` queue row as still blocked (or as auto-resolved) | Always ask the user via `AskUserQuestion`; never assume either way |
| Offering "write plan / write plan and implement" while a step is still doc-in-progress | That choice only appears once the step is `spec-validated` or later |
| Writing the implementation plan yourself before handing off to `executing-roadmap-checkpoints` | Let that skill write its own plan in its own step 4 — handing off means stopping, not pre-doing its work |
| Treating this skill as replacing `batch-plan-validate`/`executing-roadmap-checkpoints` | It only decides which one to call — all actual drafting/implementation logic still lives in them |
