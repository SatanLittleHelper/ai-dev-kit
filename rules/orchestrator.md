# Orchestrator

This file is always in context through `rules/RULES.md`. It routes work to detailed rules that are loaded only when their situation occurs. `@import` expands only inside the `RULES.md` chain; a file reached later with `Read` does not expand its own `@` references.

## Routing

| Situation | Required action |
|---|---|
| Idea, new behavior, or architecture | Read `rules/skills/brainstorming.md`, then invoke `superpowers:brainstorming`; approval per `rules/skills/document-approval.md` |
| Test plan before the implementation plan (test-worthy layers) | Read `rules/skills/writing-test-plans.md` and run its review loop (`doc-review --type=test-plan`, 3 iterations); approval per `rules/skills/document-approval.md` |
| Multi-step plan before implementation | Read `rules/skills/writing-plans.md`, then invoke `superpowers:writing-plans`; validate the draft with `doc-review --type=plan` (3 iterations) before approval per `rules/skills/document-approval.md` |
| Test scope, assertions, or coverage | Read `rules/base/testing.md` |
| Test-worthy implementation or bug fix | Read `rules/base/testing.md` and `rules/base/test-execution-policy.md`, then invoke `superpowers:test-driven-development` |
| Commit or branch | Read `rules/base/git-and-commits.md` |
| Known file path, Bash vs MCP, or dedicated-tool choice | Read `rules/base/mcp-tool-priority.md` |
| Claim work complete, fixed, or passing | Read `rules/skills/verification-before-completion.md` and run its required checks |
| Test the current changes by hand ("протестируй изменения", "test my changes") | Invoke `testing-changes` |
| Create a PR ("сделай ПР", "open a PR") | Follow instructions injected by `pr-flow`; if unavailable, read `rules/base/workflow-dependencies.md` and offer installation |
| Required skill, mod, plugin, or CLI is unavailable | Read `rules/base/workflow-dependencies.md`; name the dependency and offer installation with the exact command |
| Execute a written plan via subagents | Read `rules/skills/subagent-driven-development.md` |
| Execute a written plan with checkpoints | Read `rules/skills/executing-plans.md` |
| Long-running Plannotator process | Read `rules/skills/plannotator.md` |
| NestJS code | Read `rules/nestjs/index.md`, then the relevant topic file(s) |
| Angular code | Read `rules/angular/index.md`, then the relevant topic file(s) |
| Write a Jira task ("напиши задачу", "сделай задачу") | Invoke `jira-writer` |
| Roadmap work | Invoke `roadmap` |
| Shared vs personal file | Read `rules/base/local-vs-shared.md` |
| Artifact or temp-file location | Read `rules/base/artifacts-and-tmp.md` |

Never silently skip a missing routed skill or file. Follow `rules/base/workflow-dependencies.md`; do not reconstruct missing content from memory or claim the dependent stage was completed.

## Chaining

- Design → test plan (validated by `doc-review`, skipped when no layer is test-worthy) → implementation plan (validated by `doc-review`) → implementation via TDD when in scope → verification → commit. Each document has its own Plannotator approval cycle (`rules/skills/document-approval.md`), no native Plan Mode.
- Effort follows the stage: clarify requirements first, implement at medium effort, then switch to high (`/effort high`) to verify before the final pass; keep max for hard autonomous problems.
- For a NestJS/Angular plan, `writing-plans.md` handles stack detection and required stack reads; do not repeat them before drafting.
- For inline stack implementation outside a plan, read the relevant index and topic directly.
- TDD scope is bounded by `testing.md`'s layer table.
- Before delegation, read the project's durable context, role definition, and applicable rules; pass each subagent its goal, scope, interfaces, constraints, workflow, verification policy, and readiness criteria. Forbid commits in implementer prompts.

## Project config

When a routed rule needs a project value, read `.claude/dev-conventions.json` once. If the value is needed but absent, ask and save it; never invent it.

Keys: `ticketPrefix` (commit and branch prefix, `rules/base/git-and-commits.md`); `testing` (`testing-changes` skill settings); `codex` (shared by `codex-implement` and `doc-review`: `profiles.<name>` — `codex` by default and `local` (your own OpenAI-compatible model server, shipped with `YOUR-…` placeholders to fill in), both added by `setup.sh` / `update-ai-dev-kit` — with `model`, `effort`, `timeoutMin` and a backend: inline `provider {baseUrl, envKey}`, `modelProvider` or `codexProfile`; `implement` / `review` choose the default profile per skill. The API key lives only in the env var named by `envKey`, never in this file). The skills have defaults and handle missing keys themselves, so do not ask for them.
