# TDD as the Default Testing Workflow — Design

## Context

The `skills` repo holds this developer's personal-conventions skills, reused across projects. `testing-philosophy` currently mandates the opposite of TDD as the default: tests are written by a *separate* pass/agent from the one writing the implementation, and are run only once, at the very end of a task/plan — never per-edit, never test-first. That rule, plus mirrored language in `writing-plans-conventions`, `executing-plans-conventions`, and `subagent-driven-development-conventions`, actively blocks adopting TDD: an agent following these skills as written cannot write a failing test before the code, or run it immediately to watch it fail, without contradicting four different rules.

The developer wants to adopt TDD broadly, as the new default for all code (not an opt-in), using the existing `superpowers:test-driven-development` skill as the actual red-green-refactor engine rather than reinventing that cycle inside a personal-conventions skill. This spec defines how five interlocking skills change so that TDD becomes the default without silently dropping the parts of the current conventions that remain correct — the layer-exclusion table (what gets a unit test at all) and the plan's single final full-suite verification pass are both still valid; only the *order* and *pass-ownership* of test-writing change.

## Principle

TDD (`superpowers:test-driven-development`'s red-green-refactor cycle) becomes the default way to write any code that `testing-philosophy`'s existing layer table already requires a unit test for. It does not expand that table: layers the table excludes (thin components, repository/DAO wrappers, thin outbound API-client wrappers, pure mappers) stay excluded — TDD's own "every new function/method has a test" checklist is scoped down by this table, not the other way around.

Two things that were previously conflated under "when do tests run" must now be kept distinct across every affected skill:
- **TDD's per-step scoped test run** (verify red, verify green) — happens throughout a task, for the one test file/pattern under active work. Required, not deferred, not optional.
- **The plan's single full-suite verification pass** (build, type-check, lint, full test run) — still happens exactly once, as the last step of a multi-task plan. Unchanged.

## Changes by File

### 1. `testing-philosophy/SKILL.md`

Rewrite the **Execution Timing** section (currently "Who writes tests" / "When tests run" / review-pass exception):

- **Who writes tests:** same pass/agent that writes the implementation, not a separate pass — the test is written *first*, per `superpowers:test-driven-development`'s red-green-refactor cycle. Route there for the mechanics (write failing test → verify it fails for the right reason → minimal code to pass → verify green → refactor).
- **Scope boundary (new, explicit):** TDD's own "every new function/method has a test" is bounded by this skill's layer table above — don't add a test-first cycle for an excluded layer just because TDD's generic checklist implies otherwise.
- **When tests run:** each red/green step runs only the scoped test for the unit under work — required at every step, not deferred. The full build/type-check/lint/whole-suite pass stays a single, final step (owned by `writing-plans-conventions`/`executing-plans-conventions`) — these are different things; don't conflate a TDD-scoped run with the plan's one final pass.
- **Review-pass exception:** kept as-is — a review pass may still add/fix a test directly when it finds an existing gap (legacy code, a dropped-coverage merge) that TDD didn't produce, since the behavior already exists and isn't being test-driven fresh.
- **Bug fixes:** also go through TDD — write a failing test reproducing the bug first (mirrors `superpowers:test-driven-development`'s Debugging Integration section).

Update **Quick Reference** table rows "Who writes tests" and "When tests run" to match.

Update **Common Mistakes**:
- Remove "Same agent writes the feature and its tests in one pass" (this was the old rule's violation — now it's correct behavior).
- Add: "Writing implementation code before its test" → fix: write the failing test first, watch it fail, then minimal code (TDD, no exceptions without explicit user permission).
- Add: "Adding a test-first cycle for a layer this skill excludes, because TDD's own checklist says 'every function'" → fix: the layer table still governs scope; TDD governs process/order for whatever's already in scope.
- Reword "Running the test suite after every file edit mid-task" to clarify it's about the *full suite*, not the single scoped test TDD requires after each red/green step (which is now required, not a mistake).

### 2. `writing-plans-conventions/SKILL.md`

In **Required Plan Structure**:
- Replace the "dedicated test-writing task, routed to a separate test-writing role/pass" bullet: an implementation task in `testing-philosophy`'s test-worthy scope now shows its test-first code block (red) before its implementation code block (green), inside the *same* task — no separate test-writing task/role by default. Layers `testing-philosophy` excludes still need no test block.
- Clarify the "final verification pass... never as a scoped/targeted run mid-plan" bullet: this governs the full build/type-check/lint/whole-suite pass. TDD's own per-step scoped test runs (`superpowers:test-driven-development`'s verify-red/verify-green) happen throughout each in-scope task and are required — they are not the same thing this bullet forbids.
- Add a note to the "concrete code" bullet: for tasks in TDD scope, the task shows the test code block *before* the implementation code block — the plan documents the same test-first order the implementer will execute, not just the end state.

Update **Common Mistakes**: the "test coverage left out... add a dedicated test-writing task" row becomes "fold the test into the same implementation task as its test-first (TDD) block, per `testing-philosophy`."

### 3. `executing-plans-conventions/SKILL.md`

Clarify the "Run the plan's single final verification pass after all tasks — not per-task, not skipped" rule and its mirrored Common Mistakes row ("Running build/lint/test after each task"): both are about the full suite. A TDD-scoped test run within a task (verify red, verify green) is separate, required, and not what these rules forbid.

### 4. `subagent-driven-development-conventions/SKILL.md`

Replace the rule "Route test-writing to the test-writing role, not the implementer — an implementer subagent does not write tests unless the user explicitly asks" — this directly contradicts the new default. New rule: an implementer subagent writes its task's test first, per TDD, when the task falls in `testing-philosophy`'s test-worthy scope; the dispatching agent states this explicitly in the subagent's context packet (alongside stack-convention skills) rather than assuming the subagent infers it.

Update the corresponding Common Mistakes entries to match (remove the old "route to test-writing role" framing; nothing else in this skill needs to change).

### 5. `project-orchestrator/SKILL.md`

Routing table: add a row — "Writing or changing implementation code in a layer `testing-philosophy` requires tests for" → `superpowers:test-driven-development`, chained with `testing-philosophy` (defines what/how) and the applicable stack skill.

Chaining section: add a bullet describing this three-way chain (stack skill + `testing-philosophy` + `superpowers:test-driven-development`) as the default for any in-scope implementation task, explicitly noting TDD is now the default, not opt-in.

Final "match the sequence" line: change `design → plan → implement (stack conventions) → test → verify → commit` to `design → plan → implement via TDD (stack conventions + test-driven-development, test-first) → verify → commit`.

## Out of Scope

- `nestjs-personal-conventions` / `angular-personal-conventions` / `ts-code-style-conventions` — these define code shape/architecture, not test process; untouched.
- `superpowers:test-driven-development` itself — used as-is, not modified.
- No change to *what* counts as test-worthy (the layer table) — only to *when/by whom* the test is written for what's already in scope.

## Verification

- Read back all five edited `SKILL.md` files for internal consistency: no remaining reference to "separate test-writing pass/role" as the default, no remaining conflation between TDD's scoped run and the plan's single final pass.
- Cross-check `project-orchestrator`'s routing table row against the actual skill name `test-driven-development` (confirm it resolves for this environment via the Skill tool's available-skills listing).
- No code/tests to run — this is a documentation-only change to skill definitions.
