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

**Write the plan document in Russian** — see `rules/base/workflow-and-misc.md` → "Documentation Language". This applies to the whole document (headings, task descriptions, prose) regardless of what language the request came in; only code blocks/identifiers stay as-is.

### Exceptions: keep in English

The superpowers tooling matches some plan markup by literal English text, so these stay English even inside the Russian plan:

- **Task headings: `### Task N: <название на русском>`.** The word `Task` and the Arabic number are mandatory. `subagent-driven-development/scripts/task-brief` extracts each task with the regex `^#+[ \t]+Task[ \t]+[0-9]+`; a heading like `### Задача 1` or `### Task One` is not found (exit 3) and the implementer gets no brief. Only the part after the colon is Russian.
- **Checkboxes: `- [ ]` / `- [x]`.** The executing skills track progress by them.
- **Structural labels from the skill template:** `Step N:` in step titles, `Files:` (`Create:` / `Modify:` / `Test:`), `Interfaces:` (`Consumes:` / `Produces:`), and the `## Global Constraints` section heading. The plan reviewer and `subagent-driven-development` (conflict scan, task reviewer) refer to them by these names. Their contents are Russian.
- **Header line for agentic workers** (`> **For agentic workers:** REQUIRED SUB-SKILL: ...`) stays verbatim, including skill names.

Everything else (plan title, goal, architecture, task and step descriptions, prose) is Russian.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Drafting before stack rules are loaded | Detect and read the stack rules first |
| Prose-only implementation task | Include exact code blocks |
| Tests deferred to a separate task | Put test-first code in the same task |
| Full suite after each task | Reserve it for the single final pass |
| Commit step in the plan | Remove it |
| Writing the plan in English (or the request's language) | Write it in Russian — the plan document itself, not just trigger phrases |
| Translating the `Task N` heading ("Задача 1") | Keep `### Task N: <русское название>` — `task-brief` parses the English word |
