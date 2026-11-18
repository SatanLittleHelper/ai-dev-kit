# Writing Plans — Stack Conventions

**Required sub-skill:** invoke `superpowers:writing-plans`. Before drafting tasks, load the conventions for every stack the plan touches so code blocks already comply.

## Stack detection

| Plan touches | Required before drafting |
|---|---|
| NestJS | `nestjs-best-practices:nestjs-best-practices`, then `rules/nestjs/index.md` and relevant topics |
| Angular | `angular-best-practices:angular-best-practices`, then `rules/angular/index.md` and relevant topics |
| Both | Both pairs |
| Neither | No stack rule |

Detect stacks from the requested plan, not the repository's overall technology list. Read relevant rules before presenting tasks. If a referenced local rule is unavailable, continue with the best-practices skill and do not treat it as a blocker. Draft the plan in `tmp/drafts/<feature>-plan.md`, approve it per `rules/skills/document-approval.md` (no native Plan Mode), and save only after `approved`.

## Precondition: approved test plan (Stage B)

This file is Stage B of two-stage planning; Stage A is `rules/skills/writing-test-plans.md`. For any task with a test-worthy layer, an approved test plan must exist before drafting. If it does not, go back to Stage A first. If the change has no test-worthy layer (Markdown-only, excluded layers), Stage A is skipped; write one line in the plan: «План тестов не требуется: <причина>».

Start Stage B in a fresh draft file that does not contain the test plan: each document has its own approval cycle.

## Required plan

Include: goal, architecture, file map, implementation tasks, constraints, and one final verification pass. Every task must show concrete before/after code (or the full new file), not only prose. Test cases are not redesigned here: each test-worthy task references test IDs from the approved test plan, shows their test code before the implementation, and follows TDD. Excluded layers from `rules/base/testing.md` need no test block.

The final pass runs build, type-check, lint, and tests exactly once at the end. It is separate from TDD's scoped red/green runs. Do not include `git add`, `git commit`, or PR creation steps.

The plan's `## Global Constraints` section lists `rules/base/minimal-change.md`, so the constraint reaches every implementer, including `codex-implement` and `executing-plans`.

Store plans at `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`; delete them after implementation unless the user asks to keep them. Follow `rules/base/artifacts-and-tmp.md` for other artifacts.

**Write the plan document in Russian** — see `rules/base/workflow-and-misc.md` → "Documentation Language". This applies to the whole document (headings, task descriptions, prose) regardless of what language the request came in; only code blocks/identifiers stay as-is.

### Exceptions: keep in English

The superpowers tooling matches some plan markup by literal English text, so these stay English even inside the Russian plan:

- **Task headings: `### Task N: <название на русском>`.** The word `Task` and the Arabic number are mandatory. `subagent-driven-development/scripts/task-brief` extracts each task with the regex `^#+[ \t]+Task[ \t]+[0-9]+`; a heading like `### Задача 1` or `### Task One` is not found (exit 3) and the implementer gets no brief. Only the part after the colon is Russian.
- **Checkboxes: `- [ ]` / `- [x]`.** The executing skills track progress by them.
- **Structural labels from the skill template:** `Step N:` in step titles, `Files:` (`Create:` / `Modify:` / `Test:`), `Interfaces:` (`Consumes:` / `Produces:`), and the `## Global Constraints` section heading. The plan reviewer and `subagent-driven-development` (conflict scan, task reviewer) refer to them by these names. Their contents are Russian.
- **Header line for agentic workers** (`> **For agentic workers:** REQUIRED SUB-SKILL: ...`) stays verbatim, including skill names.

Everything else (plan title, goal, architecture, task and step descriptions, prose) is Russian.

## Review loop (before the user sees it)

The plan is validated by Codex through the `kit:doc-review` skill before the user sees it; the user sees only the result, through Plannotator approval (`rules/skills/document-approval.md`).

1. Draft the plan in `tmp/drafts/<feature>-plan.md`.
2. **Self-check first**, silently: every task heading is `### Task N: <название>`; every test ID of the approved test plan appears in exactly one task; no tests outside the test plan; test-first steps carry code and the expected failure reason; no `git add` / `git commit` / PR steps.
3. Invoke the `kit:doc-review` skill on the draft, **at most 3 iterations**:
   ```
   /doc-review tmp/drafts/<feature>-plan.md --type=plan --max=3 --profile=<P> --focus="<inputs>"
   ```
   - `<P>`: `codex.review.profile`, else `codex.profile`, else `codex`, read from `.claude/dev-conventions.json`. Pass it explicitly and **do not ask the user**.
   - `<inputs>`: the approved design spec (path), the approved test plan (path; every ID in exactly one task, no new tests), the stack rules loaded for this plan, and the request to flag any task not required by the spec or test plan and any speculative option, layer, or dependency.
   - The `doc-review` loop verifies the plan's claims against the actual code and applies fixes for critical/high findings; the draft lives in untracked `tmp/`, so its optional git steps are skipped.
4. The loop ends at `VERDICT: NO_MAJOR_ISSUES` or after 3 iterations. With major findings still open, open the plan for approval anyway, with a «Не сошлись» block at the top (each finding, the reviewer's position, the author's position); the user is the tiebreaker.
5. If `doc-review` or the `codex` CLI is unavailable, follow `rules/base/workflow-dependencies.md`; keep the step pending, do not skip it silently.

Only after this loop open the draft in Plannotator.

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
