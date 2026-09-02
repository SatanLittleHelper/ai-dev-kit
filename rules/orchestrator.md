# Orchestrator

## Overview

This file is always in context (loaded via `rules/RULES.md`, which every consuming project imports once from its own `CLAUDE.md`) — it doesn't need to be invoked, unlike a skill. It ties together this developer's personal stack/testing/workflow/tool-priority conventions: which of them are already in context (the always-on group, imported alongside this file) and which need a deliberate `Read` or skill invocation at the right moment (the on-demand group, listed below).

Rules live in a small hierarchy: `rules/base/` (cross-stack, mostly always-on), `rules/skills/` (personal layer around a `superpowers:X`/tool workflow), `rules/angular/` and `rules/nestjs/` (stack-specific, on-demand, each with its own `index.md` map). A directory's `index.md` is a table of contents for `Read`, not an `@import` aggregator — `@import` only resolves inside the always-on `rules/RULES.md` chain, never on a file reached via `Read` mid-session.

## Routing Table

Match the current situation against every row that applies (more than one can apply at once — see Chaining below):

| Situation | Do |
|---|---|
| An idea/requirement needs a design or architectural decision before any code is written | already always-on via `rules/skills/brainstorming.md` — apply it (Plan Mode + `superpowers:brainstorming`) |
| A spec or requirements exist for a multi-step task, before touching code | already always-on via `rules/skills/writing-plans.md` — apply it (Plan Mode + `superpowers:writing-plans`) |
| Executing an already-written plan by delegating tasks to subagents in the current session | Read `rules/skills/subagent-driven-development.md` |
| Executing an already-written plan with review checkpoints | Read `rules/skills/executing-plans.md` |
| About to claim work is complete, fixed, or passing checks | already always-on via `rules/skills/verification-before-completion.md` — no extra action |
| A long-running Plannotator process was started or is being polled | Read `rules/skills/plannotator.md` |
| Writing or reviewing NestJS code | Read `rules/nestjs/index.md`, then the specific topic file(s) it points to |
| Writing or reviewing Angular code | Read `rules/angular/index.md`, then the specific topic file(s) it points to |
| Writing or reviewing any TypeScript code (naming, class structure, file splitting) | already always-on via `rules/base/naming.md`, `rules/base/class-structure.md`, `rules/base/file-structure.md`, `rules/base/workflow-and-misc.md` |
| Writing or changing implementation code in a layer `rules/base/testing.md` requires tests for | invoke `superpowers:test-driven-development`, chained with `rules/base/testing.md` + `rules/base/test-execution-policy.md` (already in context) and whichever stack rule applies |
| Deciding what to test, coverage shape, or assertion style | already always-on via `rules/base/testing.md` |
| Committing or branching | already always-on via `rules/base/git-and-commits.md` — apply it (pre-commit branch check, message approval), no extra action |
| Deciding where a file belongs | Read `rules/base/local-vs-shared.md` (shared vs. personal file) or `rules/base/artifacts-and-tmp.md` (where a workflow artifact goes), as the specific question calls for |
| Creating a roadmap, resuming roadmap work, taking the next checkpoint, or batch-drafting roadmap steps | invoke skill `roadmap` |
| Searching an unfamiliar or large codebase, before `find`/`grep`/`Explore` | invoke skill `codebase-domain-map`, if installed |
| A dedicated MCP tool could handle something Bash could also do, or a known file path needs reading | already always-on via `rules/base/mcp-tool-priority.md` |

If a skill named in this table isn't installed in the current environment, skip that row silently — don't treat a missing skill as a blocker, and don't try to reconstruct its content from memory. The same applies to an on-demand rules file that isn't present (e.g. a project didn't pull in this repo as a submodule).

## Chaining

Several rows can match the same task. Typical chains:

- **Brainstorming → writing a plan:** `rules/skills/brainstorming.md` first (design), then — once the design is approved — `rules/skills/writing-plans.md` (which itself pulls in whichever stack rules the plan touches).
- **Writing a plan that touches NestJS:** `rules/skills/writing-plans.md` already handles reading `nestjs-best-practices`/`rules/nestjs/index.md` itself — don't read the stack rule a second time redundantly before it.
- **Implementing a plan task that writes NestJS code outside a plan-driven flow** (bounded/inline work): Read `rules/nestjs/index.md` (then the specific topic file) directly, no plan-related skill needed.
- **About to say "done"** on any task: `rules/skills/verification-before-completion.md` (already in context), regardless of what else already ran.
- **Implementing any task with test-worthy behavior:** `rules/base/testing.md` (decides what counts and how to assert it) chained with `superpowers:test-driven-development` (drives the red-green-refactor process, timing per `rules/base/test-execution-policy.md`) plus whichever stack rule applies (`rules/nestjs/index.md`/`rules/angular/index.md`) — TDD is the default for all such code now, not an opt-in.

When in doubt about order, match the sequence a human developer would naturally hit these decision points in: design → plan → implement via TDD (stack conventions + `test-driven-development`, test-first) → verify → commit (repo workflow).

## Project Config

Some routed rules need one or two project-specific values (currently: a ticket-tracker prefix for commit messages, used by `rules/base/git-and-commits.md`). Read this once, here, rather than in every rule that might need it:

1. Look for `.claude/dev-conventions.json` at the current repo's root.
2. If it exists, read it and use whatever values are needed (e.g. `ticketPrefix`) when applying a routed rule.
3. If it doesn't exist and the current situation needs a value it would hold (e.g. about to format a commit message per `rules/base/git-and-commits.md`), ask the user for that value, then write the file so future turns/sessions don't ask again. Don't block on it if the situation doesn't actually need it yet.
4. To change a stored value, update the file directly and confirm the new value with the user.

Schema so far:

```json
{
  "ticketPrefix": "SCB"
}
```

Treat this as append-only/extensible — a future project may add more keys as more routed rules grow config needs; don't assume this exact shape is final.

## Markdown-Generating Skills Require `ExitPlanMode` Gating

Any skill or rule applied through this router that produces a markdown artifact (a design spec, an implementation plan, a roadmap, an issue draft, or similar) must save that artifact only after `ExitPlanMode` approval — never write the final file first and validate after. This already applies to `rules/skills/brainstorming.md` (design spec), `rules/skills/writing-plans.md` (plan file), and the `roadmap` skill; it applies to any future rule/skill with the same shape (produces a durable `.md` file meant for the user to review before it's acted on). `ExitPlanMode` is also what surfaces the draft to Plannotator for review — every document a skill in this repository writes goes through this gate, not just some of them.

## Skill Discovery & Plan-Mode Discipline

- Before any response or action, check whether an available skill or always-on rule applies; if there's any non-zero chance it does, apply it before research, clarifying questions, or changes. Process skills (`brainstorming`, `systematic-debugging`, and similar) go before implementation rules.
- If a skill has a checklist, track each item as a separate step and complete it in full.
- User instructions take priority over a skill/rule and over default agent behavior.
- `rules/skills/brainstorming.md` and `rules/skills/writing-plans.md` always require native Plan Mode: enter it before invoking `superpowers:brainstorming`/`superpowers:writing-plans`, never in default mode. The subagent-driven-development workflow (`rules/skills/subagent-driven-development.md`) does not require it — go straight to reading the plan and delegating. Don't enable Plan Mode solely for that workflow unless something else requires it.
- In Plan Mode, save the working artifact only to the mode's own service file; never draft it at its final destination until `ExitPlanMode` approves.
- **After `ExitPlanMode` approval, don't start implementation automatically** — approval confirms the plan's content, not consent to begin coding. Ask explicitly what to do next: a more detailed plan, subagent-driven development, inline implementation, a git worktree, or nothing further for now.
- If native Plan Mode is required but unavailable in the current context (e.g. a subagent), say so explicitly — don't substitute a checklist tool for it.
- When asked to look at, check, or review a plan, run the project's doc-review skill rather than giving an ad-hoc review.

## Subagent Dispatch

- Choose an agent by specialization for the task at hand (implementation, research, planning, review).
- Before delegating, read the project's durable context (memory file, fast codebase index via `codebase-domain-map`, the target role's definition, applicable rules) yourself — the subagent doesn't read these on its own. Pass a full context packet in its prompt: goal, scope, interfaces, constraints (including which rules files/skills to apply — a subagent won't discover them from a bare task description), workflow mode, verification policy, readiness criteria.
- Default to a mini/cheap model for implementation, fixes, and review in a multi-agent plan, unless the user asks for something else.
- Forbid `git commit` in every implementer subagent's prompt; changes stay uncommitted.
- Treat a long-running review/monitoring process (Plannotator or similar) as finished only after a final result — an empty response, no output, or a polling timeout is intermediate, not completion. Don't end the turn while one is still active.
- A detailed plan is ready for mechanical execution — don't ask a subagent to redesign the solution or reread the whole plan when it already specifies exact steps. Merge small related items sharing a call chain/contract/test area into one task before delegating. Run one final whole-branch review after all implementation tasks, not task-by-task, unless there's an explicit risk, blocker, or request.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Treating this routing table as optional because nothing "invoked" it | It's always in context via `rules/RULES.md` — apply it like any other loaded rule, no separate invocation step needed |
| Treating this file as itself containing every convention in full | Always-on rules are inline via import; on-demand ones (`rules/nestjs/*`, `rules/angular/*`, etc.) still need a deliberate `Read` when their row matches |
| Skipping a row because "the task doesn't look complex enough" | Match the situation, not a complexity threshold — a one-line NestJS fix still means reading `rules/nestjs/index.md` |
| A missing on-demand rules file or skill causes hesitation or improvised behavior | Skip silently and proceed with what's installed/present |
| A routed skill writes its markdown artifact before `ExitPlanMode` approval | Draft in chat/Plan Mode's service file only; write the real file after approval |
| Asking the user for a config value (e.g. ticket prefix) that's already in `.claude/dev-conventions.json` | Read the file first — only ask when it's genuinely missing |
| Reading only `rules/angular/index.md`/`rules/nestjs/index.md` and treating that as the whole convention | The index is a map — still read the specific topic file(s) the task actually touches |
| Expecting `Read rules/angular/index.md` to also pull in every file it lists | `@import` in an on-demand `index.md` doesn't resolve via `Read` — only `rules/RULES.md`'s own always-on chain expands `@import` |
