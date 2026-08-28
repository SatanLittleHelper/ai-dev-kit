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

## Common Mistakes

| Mistake | Fix |
|---|---|
| Calling `superpowers:writing-plans` directly, treating stack skills as optional/situational | Both best-practices AND personal-conventions (when present) are REQUIRED for any stack the plan touches — not a judgment call |
| Loading the stack skill only if the task "seems complex enough" | Stack detection is binary (does the plan touch this stack, yes/no) — not a complexity threshold |
| Drafting task code first, then loading the stack skill to "check" it | Load before drafting — the plan's own code blocks are the artifact that needs to already comply |
