---
name: writing-plans-conventions
description: Use when you have a spec or requirements for a multi-step task, before touching code.
---

# Writing Plans — Stack Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke `superpowers:writing-plans` — it owns the actual spec→plan process (file structure, task granularity, verification step). This skill is a required pre-step layered on top of it, same relationship `roadmap-conventions` has to `superpowers:writing-roadmaps`: before drafting a single implementation task, resolve which technology stacks the plan touches and load each stack's convention skills, so the plan's code snippets are written against real conventions from the start instead of generic patterns that get "corrected" later.

This exists because a plan can satisfy `writing-plans`'s own checklist (concrete before/after code per task) while every snippet still uses default framework style — `writing-plans` doesn't know NestJS or Angular conventions, it only knows plan structure. Loading the stack skill after the plan is drafted doesn't fix it: the tasks and their code are already written.

## Stack Detection → Required Skills

| Plan touches | Invoke, in this order |
|---|---|
| NestJS code (services, controllers, DTOs, modules, guards) | `nestjs-best-practices`, then `nestjs-personal-conventions` (if installed) |
| Angular code (components, services, forms, templates) | `angular-best-practices`, then `angular-personal-conventions` (if installed) |
| Both stacks | invoke both pairs |
| Neither (pure infra, docs, config, SQL migrations) | no stack skill applies — proceed with `writing-plans` alone |

Detect the stack from what the spec actually asks for (file types, framework decorators/APIs named), not from the repo's overall tech list — a plan in a full-stack monorepo may touch only one side.

If a personal-conventions skill for a stack isn't installed in this environment, that's fine — invoke the best-practices skill alone and proceed; don't treat a missing personal-conventions skill as a blocker.

## Ordering

Invoke this skill and its required stack skills **before** presenting implementation tasks — the "Было/Стало" code blocks a plan requires must already reflect the loaded conventions when first written. Loading a stack skill after the draft exists means every task's code needs a second pass to match it; do it once, in the right order.

## Plan Mode Wiring

Use native Plan Mode before writing the plan. Before writing it, read every rule/skill relevant to its scope — universal conventions always, plus whatever the plan's specific domain touches — a single agent authors the whole plan and must know every applicable convention up front, not only the parts it happens to implement itself. After preparing the plan, wait for the standard review (`ExitPlanMode`) and act on its outcome before saving.

## Required Plan Structure

- **The plan must contain:** a goal, architecture, a file map, implementation tasks, test scenarios, constraints, and a single final verification pass. Missing any of these is an incomplete plan, not a stylistic choice.
- **The final verification pass runs build, type-check, lint, and tests exactly once**, as the very last step, after every task is implemented — never per-task. This is the *full-suite* pass; it's separate from TDD's own per-step scoped test runs (`superpowers:test-driven-development`'s verify-red/verify-green), which happen throughout each in-scope task and are required, not deferred — don't conflate the two or use one to argue against the other.
- **Every implementation task must include concrete code, not just a prose description.** For each file a task touches, show a "before" (current code, with its location) / "after" (the exact new code) pair, or the full new code block for a new file. A task that only narrates the change in words ("add a boolean return," "gate the call on the result") isn't sufficient on its own — the plan is the artifact an implementer executes mechanically, so the code must already be decided at plan-writing time, not left for the implementer to improvise. Prose may accompany the code to explain the *why*, but never replace it. **For a task in `testing-philosophy`'s test-worthy scope, show the test code block before the implementation code block** — the plan documents the same test-first order the implementer will execute, not just the end state.
- **Every implementation task in `testing-philosophy`'s test-worthy scope follows TDD by default** (see `testing-philosophy` → `superpowers:test-driven-development`): the task's own code blocks are the test first, then the minimal implementation that makes it pass — not a separate dedicated test-writing task/role. Layers `testing-philosophy` excludes (components, repositories, thin API-client wrappers, pure mappers) need no test block at all.
- **No commit steps in the plan.** Don't add `git add`, `git commit`, or PR-creation steps to any task.
- **Placement and cleanup follow `repo-workflow-conventions`:** the plan file goes wherever `superpowers:writing-plans` defaults to (`docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`), and gets deleted once the plan is fully implemented — unless the user explicitly asked to keep it.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Calling `superpowers:writing-plans` directly, treating stack skills as optional/situational | Both best-practices AND personal-conventions (when present) are REQUIRED for any stack the plan touches — not a judgment call |
| Loading the stack skill only if the task "seems complex enough" | Stack detection is binary (does the plan touch this stack, yes/no) — not a complexity threshold |
| Drafting task code first, then loading the stack skill to "check" it | Load before drafting — the plan's own code blocks are the artifact that needs to already comply |
| A task description that narrates the change in prose with no actual code | Show the before/after code — narration may explain *why*, never replace the *what* |
| Test coverage left out of the plan "for a follow-up", or planned as a separate task after the implementation task | Fold it into the same task as a test-first (TDD) code block — see `testing-philosophy` |
| A `git commit` step inside a task | Remove it — commits happen only on explicit user request, never as a plan step |
