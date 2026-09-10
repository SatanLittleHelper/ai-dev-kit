# Orchestrator

This file is always in context through `rules/RULES.md`. It routes work to detailed rules that are loaded only when their situation occurs. `@import` expands only inside the `RULES.md` chain; a file reached later with `Read` does not expand its own `@` references.

## Routing

| Situation | Required action |
|---|---|
| Idea, new behavior, or architecture | Read `rules/skills/brainstorming.md`, then invoke `superpowers:brainstorming` in native Plan Mode |
| Multi-step plan before implementation | Read `rules/skills/writing-plans.md`, then invoke `superpowers:writing-plans` in native Plan Mode |
| Test scope, assertions, or coverage | Read `rules/base/testing.md` |
| Test-worthy implementation or bug fix | Read `rules/base/testing.md` and `rules/base/test-execution-policy.md`, then invoke `superpowers:test-driven-development` |
| Commit or branch | Read `rules/base/git-and-commits.md` |
| Known file path, Bash vs MCP, or dedicated-tool choice | Read `rules/base/mcp-tool-priority.md` |
| Claim work complete, fixed, or passing | Read `rules/skills/verification-before-completion.md` and run its required checks |
| Execute a written plan via subagents | Read `rules/skills/subagent-driven-development.md` |
| Execute a written plan with checkpoints | Read `rules/skills/executing-plans.md` |
| Long-running Plannotator process | Read `rules/skills/plannotator.md` |
| NestJS code | Read `rules/nestjs/index.md`, then the relevant topic file(s) |
| Angular code | Read `rules/angular/index.md`, then the relevant topic file(s) |
| Roadmap work | Invoke `roadmap` |
| Search an unfamiliar or large codebase | Invoke `codebase-domain-map`, if installed, before exploration |
| Shared vs personal file | Read `rules/base/local-vs-shared.md` |
| Artifact or temp-file location | Read `rules/base/artifacts-and-tmp.md` |

If a routed skill or file is missing, skip it silently and continue; never reconstruct its content from memory.

## Chaining

- Design → plan → implementation via TDD when in scope → verification → commit.
- For a NestJS/Angular plan, `writing-plans.md` handles stack detection and required stack reads; do not repeat them before drafting.
- For inline stack implementation outside a plan, read the relevant index and topic directly.
- TDD scope is bounded by `testing.md`'s layer table.
- Before delegation, read the project's durable context, codebase map, role definition, and applicable rules; pass each subagent its goal, scope, interfaces, constraints, workflow, verification policy, and readiness criteria. Forbid commits in implementer prompts.

## Project config

When a routed rule needs a project value, read `.claude/dev-conventions.json` once. If the value is needed but absent, ask and save it; never invent it.
