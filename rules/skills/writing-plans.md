# Writing Plans — Stack Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke `superpowers:writing-plans` — it owns the actual spec→plan process (file structure, task granularity, verification step). This file is a required pre-step layered on top of it, same relationship the `roadmap` skill has to `superpowers:writing-roadmaps`: before drafting a single implementation task, resolve which technology stacks the plan touches and load each stack's convention rules, so the plan's code snippets are written against real conventions from the start instead of generic patterns that get "corrected" later.

This exists because a plan can satisfy `writing-plans`'s own checklist (concrete before/after code per task) while every snippet still uses default framework style — `writing-plans` doesn't know NestJS or Angular conventions, it only knows plan structure. Loading the stack rule after the plan is drafted doesn't fix it: the tasks and their code are already written.

## Stack Detection → Required Rules

| Plan touches | Invoke/read, in this order |
|---|---|
| NestJS code (services, controllers, DTOs, modules, guards) | `nestjs-best-practices`, then Read `rules/nestjs/index.md` (if this repository is available in the project) |
| Angular code (components, services, forms, templates) | `angular-best-practices`, then Read `rules/angular/index.md` (if this repository is available in the project) |
| Both stacks | invoke/read both pairs |
| Neither (pure infra, docs, config, SQL migrations) | no stack rule applies — proceed with `writing-plans` alone |

Detect the stack from what the spec actually asks for (file types, framework decorators/APIs named), not from the repo's overall tech list — a plan in a full-stack monorepo may touch only one side.

If `rules/nestjs/index.md`/`rules/angular/index.md` isn't available in this environment, that's fine — invoke the best-practices skill alone and proceed; don't treat a missing rules file as a blocker.

## Ordering

Read the stack rules **before** presenting implementation tasks — the "Было/Стало" code blocks a plan requires must already reflect the loaded conventions when first written. Loading a stack rule after the draft exists means every task's code needs a second pass to match it; do it once, in the right order.

## Plan Mode Wiring

Use native Plan Mode before writing the plan. Before writing it, read every rule relevant to its scope — universal conventions are already in context via `rules/RULES.md`, plus whatever the plan's specific domain touches — a single agent authors the whole plan and must know every applicable convention up front, not only the parts it happens to implement itself. After preparing the plan, wait for the standard review (`ExitPlanMode`) and act on its outcome before saving.

## Required Plan Structure

- **The plan must contain:** a goal, architecture, a file map, implementation tasks, test scenarios, constraints, and a single final verification pass. Missing any of these is an incomplete plan, not a stylistic choice.
- **The final verification pass runs build, type-check, lint, and tests exactly once**, as the very last step, after every task is implemented — never per-task. This is the *full-suite* pass; it's separate from TDD's own per-step scoped test runs (`superpowers:test-driven-development`'s verify-red/verify-green), which happen throughout each in-scope task and are required, not deferred — don't conflate the two or use one to argue against the other.
- **Every implementation task must include concrete code, not just a prose description.** For each file a task touches, show a "before" (current code, with its location) / "after" (the exact new code) pair, or the full new code block for a new file. A task that only narrates the change in words ("add a boolean return," "gate the call on the result") isn't sufficient on its own — the plan is the artifact an implementer executes mechanically, so the code must already be decided at plan-writing time, not left for the implementer to improvise. Prose may accompany the code to explain the *why*, but never replace it. **For a task in `rules/base/testing.md`'s test-worthy scope, show the test code block before the implementation code block** — the plan documents the same test-first order the implementer will execute, not just the end state.
- **Every implementation task in `rules/base/testing.md`'s test-worthy scope follows TDD by default** (see `rules/base/testing.md` → `superpowers:test-driven-development`): the task's own code blocks are the test first, then the minimal implementation that makes it pass — not a separate dedicated test-writing task/role. Layers `rules/base/testing.md` excludes (components, repositories, thin API-client wrappers, pure mappers) need no test block at all.
- **No commit steps in the plan.** Don't add `git add`, `git commit`, or PR-creation steps to any task.
- **Placement and cleanup follow `rules/base/artifacts-and-tmp.md`:** the plan file goes wherever `superpowers:writing-plans` defaults to (`docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`), and gets deleted once the plan is fully implemented — unless the user explicitly asked to keep it.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Calling `superpowers:writing-plans` directly, treating stack rules as optional/situational | Both best-practices AND the personal-convention rule (when present) are REQUIRED for any stack the plan touches — not a judgment call |
| Loading the stack rule only if the task "seems complex enough" | Stack detection is binary (does the plan touch this stack, yes/no) — not a complexity threshold |
| Drafting task code first, then loading the stack rule to "check" it | Load before drafting — the plan's own code blocks are the artifact that needs to already comply |
| A task description that narrates the change in prose with no actual code | Show the before/after code — narration may explain *why*, never replace the *what* |
| Test coverage left out of the plan "for a follow-up", or planned as a separate task after the implementation task | Fold it into the same task as a test-first (TDD) code block — see `rules/base/testing.md` |
| A `git commit` step inside a task | Remove it — commits happen only on explicit user request, never as a plan step |
