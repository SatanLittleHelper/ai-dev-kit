---
name: project-orchestrator
description: Use as the very first action in response to any task, before invoking any other skill — the mandatory entry point that routes to this developer's personal stack, testing, workflow, and tool-priority convention skills.
---

# Project Orchestrator

## Overview

This developer keeps one personal-conventions skill per concern (stack, testing, git workflow, tool priority, superpowers-workflow wrapper) and reuses the same skills across most projects, since most projects share the same stacks. Rather than relying on each individual skill's description to win a naming contest against a well-known built-in skill (e.g. `superpowers:brainstorming`), **this skill is the single mandatory dispatcher**: invoke it first, unconditionally, before reaching for any other skill — then let it route to whichever of the skills below actually apply.

This is an ordering rule, not a name substitution: always call `project-orchestrator` before anything else, the same way `EnterPlanMode` always precedes `superpowers:writing-plans`. Once inside this skill, chain into the routed skill(s) below by name — that hand-off is reliable because it's an explicit instruction inside a skill already being followed, not a discovery choice between two similarly-described skills.

## Routing Table

Match the current situation against every row that applies (more than one can apply at once — see Chaining below) and invoke the corresponding skill, only if it's installed in this environment:

| Situation | Invoke |
|---|---|
| An idea/requirement needs a design or architectural decision before any code is written | `brainstorming-conventions` |
| A spec or requirements exist for a multi-step task, before touching code | `writing-plans-conventions` |
| Executing an already-written plan by delegating tasks to subagents in the current session | `subagent-driven-development-conventions` |
| Executing an already-written plan with review checkpoints | `executing-plans-conventions` |
| About to claim work is complete, fixed, or passing checks | `verification-before-completion-conventions` |
| A long-running Plannotator process was started or is being polled | `plannotator-conventions` |
| Writing or reviewing NestJS code | `nestjs-personal-conventions` |
| Writing or reviewing Angular code | `angular-personal-conventions` |
| Writing or reviewing any TypeScript code | `ts-code-style-conventions` |
| Writing or changing implementation code in a layer `testing-philosophy` requires tests for | `superpowers:test-driven-development`, chained with `testing-philosophy` (defines what/how) and the applicable stack skill |
| Deciding what to test, coverage shape, or assertion style | `testing-philosophy` |
| Deciding where a file belongs, or about to branch/commit | `repo-workflow-conventions` |
| Searching an unfamiliar or large codebase, before `find`/`grep`/`Explore` | `codebase-domain-map` |
| A dedicated MCP tool could handle something Bash could also do, or a known file path needs reading | `mcp-tool-priority` |

If a skill named in this table isn't installed in the current environment, skip that row silently — don't treat a missing skill as a blocker, and don't try to reconstruct its content from memory.

## Chaining

Several rows can match the same task. Typical chains:

- **Brainstorming → writing a plan:** `brainstorming-conventions` first (design), then — once the design is approved — `writing-plans-conventions` (which itself pulls in whichever stack skills the plan touches).
- **Writing a plan that touches NestJS:** `writing-plans-conventions` already handles invoking `nestjs-best-practices`/`nestjs-personal-conventions` itself — don't invoke the stack skill a second time redundantly before it.
- **Implementing a plan task that writes NestJS code outside a plan-driven flow** (bounded/inline work): `nestjs-personal-conventions` directly, no plan-related skill needed.
- **About to say "done"** on any task: `verification-before-completion-conventions`, regardless of what else already ran.
- **Implementing any task with test-worthy behavior:** `testing-philosophy` (decides what counts and how to assert it) chained with `superpowers:test-driven-development` (drives the red-green-refactor process) plus whichever stack skill applies (`nestjs-personal-conventions`/`angular-personal-conventions`/`ts-code-style-conventions`) — TDD is the default for all such code now, not an opt-in.

When in doubt about order, match the sequence a human developer would naturally hit these decision points in: design → plan → implement via TDD (stack conventions + `test-driven-development`, test-first) → verify → commit (repo workflow).

## Project Config

Some routed skills need one or two project-specific values (currently: a ticket-tracker prefix for commit messages, used by `repo-workflow-conventions`). Read this once, here, rather than in every skill that might need it:

1. Look for `.claude/dev-conventions.json` at the current repo's root.
2. If it exists, read it and pass along whatever values a routed skill needs (e.g. `ticketPrefix`) when invoking that skill.
3. If it doesn't exist and the current situation needs a value it would hold (e.g. about to format a commit message per `repo-workflow-conventions`), ask the user for that value, then write the file so future turns/sessions don't ask again. Don't block on it if the situation doesn't actually need it yet.
4. To change a stored value, update the file directly and confirm the new value with the user.

Schema so far:

```json
{
  "ticketPrefix": "SCB"
}
```

Treat this as append-only/extensible — a future project may add more keys as more routed skills grow config needs; don't assume this exact shape is final.

## Markdown-Generating Skills Require `ExitPlanMode` Gating

Any skill invoked through this router that produces a markdown artifact (a design spec, an implementation plan, or similar) must save that artifact only after `ExitPlanMode` approval — never write the final file first and validate after. This already applies to `brainstorming-conventions` (design spec) and `writing-plans-conventions` (plan file); it applies to any future skill added to the routing table with the same shape (produces a durable `.md` file meant for the user to review before it's acted on).

## Skill Discovery & Plan-Mode Discipline

- Before any response or action, check whether an available skill applies; if there's any non-zero chance it does, activate it before research, clarifying questions, or changes. Process skills (`brainstorming`, `systematic-debugging`, and similar) go before implementation skills.
- If a skill has a checklist, track each item as a separate step and complete it in full.
- User instructions take priority over a skill and over default agent behavior.
- `brainstorming-conventions` and `writing-plans-conventions` always require native Plan Mode: enter it before activating them, never in default mode. `subagent-driven-development-conventions` does not require it — go straight to reading the plan and delegating. Don't enable Plan Mode solely for that workflow unless something else requires it.
- In Plan Mode, save the working artifact only to the mode's own service file; never draft it at its final destination until `ExitPlanMode` approves.
- **After `ExitPlanMode` approval, don't start implementation automatically** — approval confirms the plan's content, not consent to begin coding. Ask explicitly what to do next: a more detailed plan, `subagent-driven-development-conventions`, inline implementation, a git worktree, or nothing further for now.
- If native Plan Mode is required but unavailable in the current context (e.g. a subagent), say so explicitly — don't substitute a checklist tool for it.
- When asked to look at, check, or review a plan, run the project's doc-review skill rather than giving an ad-hoc review.

## Subagent Dispatch

- Choose an agent by specialization for the task at hand (implementation, research, planning, review).
- Before delegating, read the project's durable context (memory file, fast codebase index via `codebase-domain-map`, the target role's definition, applicable rules) yourself — the subagent doesn't read these on its own. Pass a full context packet in its prompt: goal, scope, interfaces, constraints (including which convention skills to invoke — a subagent won't discover them from a bare task description), workflow mode, verification policy, readiness criteria.
- Default to a mini/cheap model for implementation, fixes, and review in a multi-agent plan, unless the user asks for something else.
- Forbid `git commit` in every implementer subagent's prompt; changes stay uncommitted.
- Treat a long-running review/monitoring process (Plannotator or similar) as finished only after a final result — an empty response, no output, or a polling timeout is intermediate, not completion. Don't end the turn while one is still active.
- A detailed plan is ready for mechanical execution — don't ask a subagent to redesign the solution or reread the whole plan when it already specifies exact steps. Merge small related items sharing a call chain/contract/test area into one task before delegating. Run one final whole-branch review after all implementation tasks, not task-by-task, unless there's an explicit risk, blocker, or request.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Calling a well-known skill by its common name (`brainstorming`, `writing-plans`) directly, without going through this skill first | Always invoke `project-orchestrator` first, unconditionally — treat it like `EnterPlanMode`, not like an optional lookup |
| Treating this skill as itself containing the conventions | It only routes — the actual rules live in the skill each row points to |
| Skipping a row because "the task doesn't look complex enough" | Match the situation, not a complexity threshold — a one-line NestJS fix still routes to `nestjs-personal-conventions` |
| A missing skill in the table causes hesitation or improvised behavior | Skip silently and proceed with what's installed |
| A routed skill writes its markdown artifact before `ExitPlanMode` approval | Draft in chat/Plan Mode's service file only; write the real file after approval |
| Asking the user for a config value (e.g. ticket prefix) that's already in `.claude/dev-conventions.json` | Read the file first — only ask when it's genuinely missing |
