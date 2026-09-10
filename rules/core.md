# Core Always-On Contract

These compact guardrails are always in context through `rules/RULES.md`. User instructions override repository rules. Process/design rules come before implementation rules.

## Required reads and gates

- Before design or an architectural decision: enter native Plan Mode, then read `rules/skills/brainstorming.md` and invoke `superpowers:brainstorming`.
- Before writing a multi-step plan: read `rules/skills/writing-plans.md`, enter native Plan Mode, and invoke `superpowers:writing-plans`.
- Before test-worthy implementation: read `rules/base/testing.md` and `rules/base/test-execution-policy.md`, then invoke `superpowers:test-driven-development`. Follow the testing layer table; do not expand it from a generic TDD checklist.
- Before committing or branching: read `rules/base/git-and-commits.md`. Never commit automatically.
- Before reading a known file or choosing between Bash and a dedicated tool: apply `rules/base/mcp-tool-priority.md`.
- Before claiming work complete, fixed, or passing: run the relevant checks and read/apply `rules/skills/verification-before-completion.md`.

The detailed file must be read before the corresponding action; its rules are not available merely because this contract mentions the path. If a routed file or skill is unavailable, skip it silently and do not reconstruct it from memory.

## Always-on conventions

Apply the imported naming, class-structure, file-structure, and workflow rules to TypeScript work. Apply the router for Angular/NestJS rules, roadmap work, codebase exploration, plan execution, subagents, and Plannotator.

Before any response or action, check whether a rule or skill applies. Complete applicable skill checklists. Keep durable markdown artifacts in Plan Mode until `ExitPlanMode` approval; after approval, ask before starting implementation. While native Plan Mode is active, end the turn with `ExitPlanMode` or `AskUserQuestion`.
