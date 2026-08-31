---
name: subagent-driven-development-conventions
description: Use when executing an implementation plan by delegating its tasks to subagents in the current session — the same triggering moment as superpowers:subagent-driven-development.
---

# Subagent-Driven Development Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke `superpowers:subagent-driven-development` — it owns the actual delegation loop. This skill is a required layer on top: what context to load before delegating, what goes in a subagent's prompt, model choice, and review cadence.

## Rules

- **Native Plan Mode is not required** for this workflow — go straight to reading the plan and delegating tasks. Don't enable Plan Mode solely to use this workflow, unless the user or another skill separately requires it.
- **Before delegating, read the project's own durable context** — its memory file, a fast codebase index (e.g. via `codebase-domain-map`), the target subagent's role definition, and the rules relevant to the task's scope. The dispatching agent does this itself; a subagent doesn't read these on its own.
- **Pass a full context packet explicitly in each subagent's prompt:** goal, scope, interfaces, applicable constraints (including which stack-convention skills to invoke — a subagent doesn't discover skills from a bare task description), the chosen workflow mode, verification policy, and readiness criteria.
- **Default to a mini/cheap model** for implementation and review subagents, unless the user specifies a different one.
- **Implementer subagents never commit** — explicitly forbid `git commit` in the prompt; changes stay uncommitted (see `repo-workflow-conventions`).
- **The implementer subagent writes its task's test itself, test-first**, when the task falls in `testing-philosophy`'s test-worthy scope — per TDD, the same pass that writes the code writes its test, before the code exists. State this explicitly in the subagent's prompt (alongside which stack-convention skills apply) rather than assuming it infers it; don't route test-writing to a separate role by default (see `testing-philosophy`).
- **One final whole-branch review, not per-task.** After all implementation tasks are done, run a single final review. Don't run a task-by-task review unless there's an explicit risk, blocker, or user request.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Entering Plan Mode "just in case" before this workflow | Skip it — go straight to delegation |
| Dispatching a subagent with only "implement X" and no explicit constraints/skills list | Build the full context packet first — the subagent has no other way to see it |
| Using a large/expensive model for a mechanical implementation task | Default to mini/cheap unless the user asked for something else |
| An implementer subagent runs `git commit` after finishing its task | Forbid it explicitly in the prompt |
| Reviewing after every single task | Batch into one final whole-branch review |
