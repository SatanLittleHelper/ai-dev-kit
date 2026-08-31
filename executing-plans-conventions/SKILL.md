---
name: executing-plans-conventions
description: Use when starting to execute an already-written implementation plan document — the same triggering moment as superpowers:executing-plans.
---

# Executing Plans Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke `superpowers:executing-plans` — it owns the actual execution/review-checkpoint process. This skill is a required layer on top: how mechanically to trust the plan, and what not to do around commits.

## Rules

- **Reread the plan before executing**, and check it for contradictions with the repository's current state — the repo may have moved since the plan was written.
- **A detailed plan is ready for mechanical execution.** Do not ask a subagent to redesign the solution, or reread the whole plan itself, when the plan already contains exact steps and interfaces — that's re-litigating a decision already made at plan-writing time.
- **Execute tasks in the order the plan defines**, not reordered for convenience.
- **Run the plan's single final verification pass after all tasks** — not per-task, not skipped. This is the *full* build/type-check/lint/whole-suite pass; it's separate from TDD's own per-step scoped test runs (verify-red/verify-green) inside each task, which are required throughout, not deferred to this pass — don't skip those while waiting for the final one.
- **No `git add`/`git commit`/PR creation without a direct request from the user** — see the `repo-workflow-conventions` skill for the general rule this instance follows.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Starting execution without rereading the plan first | Reread it — the repo may have drifted since it was written |
| Asking an implementer subagent to redesign a step the plan already specifies exactly | Trust the plan; only escalate if it's genuinely wrong for the current repo state |
| Running the *full* build/lint/test suite after each task | Wait for the plan's single final verification pass — but still run TDD's own scoped single-test verify-red/verify-green inside each in-scope task, that's not the same thing |
| Committing after finishing all tasks without being asked | Leave changes uncommitted; the user commits or asks explicitly |
