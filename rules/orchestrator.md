# Orchestrator

This file is always in context through `rules/RULES.md`. It routes work between always-on rules and deliberate reads/invocations. `@import` expands only inside the `RULES.md` chain; files reached later with `Read` do not expand their own `@` references.

## Routing

| Situation | Action |
|---|---|
| Idea or requirement needs design | Apply always-on `rules/skills/brainstorming.md` in native Plan Mode; invoke `superpowers:brainstorming` |
| Multi-step spec exists before code | Apply always-on `rules/skills/writing-plans.md` in native Plan Mode; invoke `superpowers:writing-plans` |
| Execute a written plan via subagents | Read `rules/skills/subagent-driven-development.md` |
| Execute a written plan with checkpoints | Read `rules/skills/executing-plans.md` |
| Long-running Plannotator process | Read `rules/skills/plannotator.md` |
| NestJS code | Read `rules/nestjs/index.md`, then the relevant topic file(s) |
| Angular code | Read `rules/angular/index.md`, then the relevant topic file(s) |
| TypeScript naming/structure | Apply always-on naming, class, file, and workflow rules |
| Test-worthy implementation | Invoke `superpowers:test-driven-development`; apply always-on testing and test-execution rules plus the stack rules |
| Decide test scope/assertions | Apply always-on `rules/base/testing.md` |
| Commit or branch | Apply always-on `rules/base/git-and-commits.md` |
| Decide shared vs personal file | Read `rules/base/local-vs-shared.md` |
| Decide artifact/temp location | Read `rules/base/artifacts-and-tmp.md` |
| Roadmap work | Invoke `roadmap` |
| Search an unfamiliar/large codebase | Invoke `codebase-domain-map`, if installed, before exploration |
| Bash vs dedicated MCP tool, or known file path | Apply always-on `rules/base/mcp-tool-priority.md` |
| Claim work complete/fixed/passing | Apply always-on `rules/skills/verification-before-completion.md` |

If a routed skill or on-demand file is missing, skip it silently and continue; do not reconstruct it from memory.

## Chaining

- Design → plan → implementation via TDD (when in scope) → verification → commit.
- For a plan touching NestJS or Angular, `writing-plans.md` handles the stack-specific reads; do not repeat them before drafting.
- For inline implementation outside a plan, read the relevant stack index and topic directly.
- TDD is bounded by `testing.md`'s layer table; it does not add tests for excluded components, repositories, thin clients, or pure mappers.

## Project Config

If the current repository has `.claude/dev-conventions.json`, read it once when a routed rule needs a value such as `ticketPrefix`. If the value is needed but absent, ask and save it; never invent it.

## Markdown Artifacts and Plan Mode

Any routed workflow that produces a durable markdown artifact (spec, plan, roadmap, issue draft) saves it only after `ExitPlanMode` approval. While native Plan Mode is active, end each turn with `ExitPlanMode` or `AskUserQuestion`. After approval, do not start implementation automatically; ask what the user wants next. If native Plan Mode is unavailable, state that instead of substituting another gate.

## Skill Discipline

Before any response or action, check applicable skills/rules; process skills come before implementation rules. Complete skill checklists. User instructions override these rules. When reviewing a plan, use the project's doc-review workflow rather than an ad-hoc review.

## Subagents

Before delegation, read the project's durable context, codebase map, role definition, and applicable rules yourself. Pass each subagent the goal, scope, interfaces, constraints, workflow mode, verification policy, and readiness criteria. Prefer a cheap model for implementation/review. Forbid commits in implementer prompts. Treat long-running review/monitoring processes as active until a final result, not an empty response or polling timeout. Execute detailed plans mechanically; do not ask agents to redesign them. Run one final whole-branch review unless risk or request requires otherwise.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Treating the router as optional | It is always-on; apply every matching row |
| Reading only a stack index | Read the specific topic files it points to |
| Relying on `@` inside an on-demand file | Read referenced files explicitly |
| Saving a markdown artifact before approval | Keep it in the Plan Mode service file until `ExitPlanMode` |
| Automatically implementing after plan approval | Ask the user for the next workflow |
