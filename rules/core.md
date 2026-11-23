# Core Always-On Contract

These compact guardrails are always in context through `rules/RULES.md`. User instructions override repository rules. Process/design rules come before implementation rules.

## Required reads and gates

- Work on a task (a ticket, a roadmap step or a standalone task) goes through the `task-flow` skill: `flow status` → `flow next` → work → `flow submit` / `flow done` → `flow wait`. The flow keeps the stage order (ticket, in-progress, spec, test plan, plan, implement, simplify, check, local test, review, PR), puts the content rules of each stage into its work package, runs the document approval in Plannotator and refuses to close a stage without evidence. Do not reproduce the stage order from memory and do not start a stage out of order. If `flow` is unavailable, name it and follow `rules/base/workflow-dependencies.md`.
- Outside a task (an idea without a ticket, a roadmap draft, a Jira draft, a one-off document): read `rules/skills/document-approval.md` and the content rule of that document: a design — `rules/skills/brainstorming.md` and `superpowers:brainstorming`; a test plan (test-worthy layers only) — `rules/skills/writing-test-plans.md`, which owns that process (there is no skill for it); an implementation plan — `rules/skills/writing-plans.md` and `superpowers:writing-plans`. The order is design → test plan → implementation plan, each with its own approval, and the next document starts automatically after the previous one is saved. Documents are written in Russian — see `rules/base/workflow-and-misc.md` → "Documentation Language"; machine-parsed plan markup stays English (`rules/skills/writing-plans.md`).
- Before test-worthy implementation: read `rules/base/testing.md` and `rules/base/test-execution-policy.md`, then invoke `superpowers:test-driven-development`. Follow the testing layer table; do not expand it from a generic TDD checklist.
- Before committing or branching: read `rules/base/git-and-commits.md`. Never commit automatically.
- Before reading a known file or choosing between Bash and a dedicated tool: apply `rules/base/mcp-tool-priority.md`.
- Before claiming work complete, fixed, or passing: run the relevant checks and read/apply `rules/skills/verification-before-completion.md`.

This contract only points to the detailed files: read the one that matches the action before you act. If a routed file, skill, mod, plugin, or CLI is unavailable, name it and offer installation or repair using `rules/base/workflow-dependencies.md`. Never skip it silently, reconstruct its content from memory, or report its dependent stage as completed.

## Always-on conventions

Apply the imported naming, class-structure, file-structure, and workflow rules to TypeScript work. Apply the router for Angular/NestJS rules, roadmap work, codebase exploration, plan execution, subagents, and Plannotator.

When a task matches a situation in the routing table, apply its rule or skill, and follow the checklist of any skill you invoke. Inside a task, document approval is run by `flow` (`flow submit` / `flow wait`). A document outside a task is approved through Plannotator **without native Plan Mode** — `rules/skills/document-approval.md`: draft in `tmp/drafts/<slug>.md`, open with `plannotator-annotate`, save to the target path only after `approved`. Do not call `EnterPlanMode`/`ExitPlanMode` for this, even if a global instruction says so. After approval, ask before starting implementation; moving to the next planning document is not implementation and starts automatically.

## Autonomy

Make reversible local edits within the task on your own. Wait for confirmation before anything irreversible or visible outside the repo: deleting files beyond the task, push, PR merge, DB or infra changes, calls to external services. If a requirement is ambiguous, ask one focused question instead of guessing. On long tasks, keep a progress checklist in a file so it survives context compaction.
