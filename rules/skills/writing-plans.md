# Writing Plans — Stack Conventions

**Required sub-skill:** invoke `superpowers:writing-plans`. Before drafting tasks, load the conventions for every stack the plan touches so code blocks already comply.

## Stacks

Detect the stacks from the requested plan, not from the repository's technology list. Inside a task `flow next` puts the stack index and the best-practice skills to call into the work package. Outside a task: NestJS — `nestjs-best-practices:nestjs-best-practices`, then `rules/nestjs/index.md` and the relevant topics; Angular — `angular-best-practices:angular-best-practices`, then `rules/angular/index.md` and the relevant topics; neither — no stack rule. If a referenced local rule is unavailable, continue with the best-practices skill and do not treat it as a blocker. Read the rules before presenting tasks.

## Precondition: approved test plan (Stage B)

This file is Stage B of two-stage planning; Stage A is `rules/skills/writing-test-plans.md`. For any task with a test-worthy layer, an approved test plan must exist before drafting. If it does not, go back to Stage A first. If the change has no test-worthy layer (Markdown-only, excluded layers), Stage A is skipped; write one line in the plan: «План тестов не требуется: <причина>».

**Exception — small task (a plan of a single task):** there is no separate test plan and no Stage B draft: the test cases are the first part of this plan (`## Тест-кейсы`), approved together with it. See `rules/skills/writing-test-plans.md` → "Small task: one combined document". The self-check and review `<inputs>` below then treat that section as the approved test plan for ID traceability (every ID in exactly one task — here, Task 1).

## Required plan

Include: goal, architecture, file map, implementation tasks, constraints, and one final verification pass. Every task must show concrete before/after code (or the full new file), not only prose. Test cases are not redesigned here: each test-worthy task references test IDs from the approved test plan, shows their test code before the implementation, and follows TDD. Excluded layers from `rules/base/testing.md` need no test block.

The final pass runs build, type-check, lint, and tests exactly once at the end. It is separate from TDD's scoped red/green runs. Do not include `git add`, `git commit`, or PR creation steps.

The plan's `## Global Constraints` section lists `rules/base/minimal-change.md`, so the constraint reaches every implementer, including `codex-implement` and `executing-plans`.

Inside a task the target path comes from `flow next`. Outside a task store plans at `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md` after approval (`rules/skills/document-approval.md`) and delete them after implementation unless the user asks to keep them. Follow `rules/base/artifacts-and-tmp.md` for other artifacts.

**Write the plan document in Russian** — see `rules/base/workflow-and-misc.md` → "Documentation Language". This applies to the whole document (headings, task descriptions, prose) regardless of what language the request came in; only code blocks/identifiers stay as-is.

### Exceptions: keep in English

The superpowers tooling matches some plan markup by literal English text, so these stay English even inside the Russian plan:

- **Task headings: `### Task N: <название на русском>`.** The word `Task` and the Arabic number are mandatory. `subagent-driven-development/scripts/task-brief` extracts each task with the regex `^#+[ \t]+Task[ \t]+[0-9]+`; a heading like `### Задача 1` or `### Task One` is not found (exit 3) and the implementer gets no brief. Only the part after the colon is Russian.
- **Checkboxes: `- [ ]` / `- [x]`.** The executing skills track progress by them.
- **Structural labels from the skill template:** `Step N:` in step titles, `Files:` (`Create:` / `Modify:` / `Test:`), `Interfaces:` (`Consumes:` / `Produces:`), and the `## Global Constraints` section heading. The plan reviewer and `subagent-driven-development` (conflict scan, task reviewer) refer to them by these names. Their contents are Russian.
- **Header line for agentic workers** (`> **For agentic workers:** REQUIRED SUB-SKILL: ...`) stays verbatim, including skill names.

Everything else (plan title, goal, architecture, task and step descriptions, prose) is Russian.

## Review loop (before the user sees it)

Inside a task `flow submit` runs the Codex review (`kit:doc-review`, `--type=plan`, 3 iterations, profile from `.claude/dev-conventions.json`) and `flow validate` checks the format (`### Task N:` headings, checkboxes, Test IDs, no commit or PR steps). Outside a task self-check first (every task heading is `### Task N: <название>`; every test ID of the approved test plan appears in exactly one task; no tests outside the test plan; test-first steps carry code and the expected failure reason; no `git add` / `git commit` / PR steps), then run `/doc-review <draft> --type=plan --max=3 --profile=<P> --focus="<inputs>"` with the approved design spec, the approved test plan, the stack rules and the request to flag any task not required by the spec or test plan. At the limit with open major findings add a «Не сошлись» block at the top. If `doc-review` or the `codex` CLI is unavailable, follow `rules/base/workflow-dependencies.md`. Approval: `rules/skills/document-approval.md`.

## Test part of every task

The cases, their Дано / Когда / Тогда, and mock rationale are decided in the approved test plan and are not repeated here. For every test-worthy task, build the task around its tests instead of appending them. Each such task states:

- **Test IDs:** the IDs from the test plan this task implements (`U1`, `U2`, …). Every ID of the test plan appears in exactly one task.
- **Test first:** a "write the failing test" step with the actual test code for those IDs precedes the implementation step, with the expected failure reason, so the run proves the test fails for the right reason and not because of a typo.
- **Layer and file:** the layer from `rules/base/test-execution-policy.md` → "TDD workflow", the spec file path, and the `describe` name.
- **Fixtures and mocks in code:** which shared fixtures are reused and from where; the mock setup that realizes the `Моки:` lines of the test plan.
- **Loop command:** the scoped command for the file; the full build, type-check, lint, and whole-suite pass stays a single final step.
- **Missing infrastructure:** if the layer has none, the task starts with adding it, or the plan stops and says so (`rules/base/testing.md` → "Missing Test Infrastructure"). The test is never dropped.

**Order:** tasks follow the test plan's layers: unit tasks first, then integration, then e2e.

**No new tests in Stage B.** Do not add tests that are not in the test plan, and do not change what a case verifies. If a case is wrong or missing, go back to Stage A (edit and review loop), then continue.

A plan for Markdown-only changes has no test steps: it lists each edit as before/after.

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
| Tests as one line at the end of a task | Test-first step with test IDs, test code, layer, file, loop command, and expected failure reason |
| Drafting the implementation plan before the test plan is approved | Run Stage A first (`rules/skills/writing-test-plans.md`), unless it is skipped for lack of test-worthy layers |
| A test in the plan that has no ID in the test plan, or a test-plan ID in no task | Go back to Stage A, or place the ID in exactly one task |
| Appending this plan to the approved test plan's draft file | Fresh draft file per document |
| Showing the plan to the user before the `doc-review` loop | Run `doc-review --type=plan --max=3` first; the user sees the result |
| A plan task for a layer with no test infrastructure that just omits the test | Start the task with adding the infrastructure, or stop and report it |
| Test or grep-check steps in a plan that only edits Markdown | List the edits as before/after; no test steps |
