# Core Always-On Contract

These compact guardrails are always in context through `rules/RULES.md`. User instructions override repository rules. Process/design rules come before implementation rules.

## Required reads and gates

- Before design or an architectural decision: enter native Plan Mode, then read `rules/skills/brainstorming.md` and invoke `superpowers:brainstorming`. The resulting design spec is written in Russian — see `rules/base/workflow-and-misc.md` → "Documentation Language".
- Before writing a multi-step plan: read `rules/skills/writing-plans.md`, enter native Plan Mode, and invoke `superpowers:writing-plans`. The resulting plan document is written in Russian, except the machine-parsed markup that must stay English (`### Task N:` headings, checkboxes, `Step`/`Files`/`Global Constraints` labels) — see `rules/skills/writing-plans.md`.
- Before test-worthy implementation: read `rules/base/testing.md` and `rules/base/test-execution-policy.md`, then invoke `superpowers:test-driven-development`. Follow the testing layer table; do not expand it from a generic TDD checklist.
- Before committing or branching: read `rules/base/git-and-commits.md`. Never commit automatically.
- Before reading a known file or choosing between Bash and a dedicated tool: apply `rules/base/mcp-tool-priority.md`.
- Before claiming work complete, fixed, or passing: run the relevant checks and read/apply `rules/skills/verification-before-completion.md`.

This contract only points to the detailed files: read the one that matches the action before you act. If a routed file or skill is unavailable, skip it and don't reconstruct it from memory.

## Always-on conventions

Apply the imported naming, class-structure, file-structure, and workflow rules to TypeScript work. Apply the router for Angular/NestJS rules, roadmap work, codebase exploration, plan execution, subagents, and Plannotator.

When a task matches a situation in the routing table, apply its rule or skill, and follow the checklist of any skill you invoke. Keep durable markdown artifacts in Plan Mode until `ExitPlanMode` approval; after approval, ask before starting implementation. While native Plan Mode is active, end the turn with `ExitPlanMode` or `AskUserQuestion`.

## Autonomy

Make reversible local edits within the task on your own. Wait for confirmation before anything irreversible or visible outside the repo: deleting files beyond the task, push, PR merge, DB or infra changes, calls to external services. If a requirement is ambiguous, ask one focused question instead of guessing. On long tasks, keep a progress checklist in a file so it survives context compaction.
