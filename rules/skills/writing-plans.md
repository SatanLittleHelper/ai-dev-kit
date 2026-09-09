# Writing Plans — Stack Conventions

**Required sub-skill:** invoke `superpowers:writing-plans`. Before drafting tasks, load the conventions for every stack the plan touches so code blocks already comply.

## Stack detection

| Plan touches | Required before drafting |
|---|---|
| NestJS | `nestjs-best-practices`, then `rules/nestjs/index.md` and relevant topics |
| Angular | `angular-best-practices`, then `rules/angular/index.md` and relevant topics |
| Both | Both pairs |
| Neither | No stack rule |

Detect stacks from the requested plan, not the repository's overall technology list. Read relevant rules before presenting tasks. If a referenced local rule is unavailable, continue with the best-practices skill and do not treat it as a blocker. Enter native Plan Mode before writing; after preparing the plan, use the standard `ExitPlanMode` review and save only after approval.

## Required plan

Include: goal, architecture, file map, implementation tasks, test scenarios, constraints, and one final verification pass. Every task must show concrete before/after code (or the full new file), not only prose. For test-worthy layers, show test code before implementation and follow TDD. Excluded layers from `rules/base/testing.md` need no test block.

The final pass runs build, type-check, lint, and tests exactly once at the end. It is separate from TDD's scoped red/green runs. Do not include `git add`, `git commit`, or PR creation steps.

Store plans at `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`; delete them after implementation unless the user asks to keep them. Follow `rules/base/artifacts-and-tmp.md` for other artifacts.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Drafting before stack rules are loaded | Detect and read the stack rules first |
| Prose-only implementation task | Include exact code blocks |
| Tests deferred to a separate task | Put test-first code in the same task |
| Full suite after each task | Reserve it for the single final pass |
| Commit step in the plan | Remove it |
