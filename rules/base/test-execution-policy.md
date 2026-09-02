# Test Execution Policy: TDD by Default

Who writes tests, when they run, and in what order — as opposed to *what* gets tested and how, see `rules/base/testing.md` for that.

## Quick Reference

| Concern | Rule |
|---|---|
| Who writes tests | Same pass, test-first — the agent writing the code writes its test first, per TDD (`superpowers:test-driven-development`) |
| When tests run | Per TDD red/green step, the one scoped test runs immediately (required) — the full build/lint/whole-suite pass stays a single run at the very end |

**TDD is the default way to write any code `rules/base/testing.md` requires a unit test for** (its layer table). Route to `superpowers:test-driven-development` for the mechanical cycle: write one failing test → verify it fails for the right reason → write minimal code to pass → verify it passes → refactor → repeat. This replaces writing tests after the fact in a separate pass.

**Who writes the tests:** the same agent/pass that writes the implementation writes its test — first, before the implementation exists. There is no longer a default split between "who writes the code" and "who writes its test"; TDD requires them to co-evolve in the same pass, since the code doesn't exist yet when the test is written.

**Scope boundary:** TDD's own checklist says "every new function/method has a test" — that's bounded by `rules/base/testing.md`'s layer table, not expanded by it. Don't start a test-first cycle for a layer that file excludes (components, repositories, thin API-client wrappers, pure mappers) just because TDD's generic checklist implies otherwise; skip those layers exactly as before.

**When tests run:** two different things, don't conflate them.
- TDD's own per-step runs (verify red, verify green) are scoped to the one test file/pattern under active work, and happen throughout the task — required at every step, never deferred.
- The full build/type-check/lint/whole-suite pass still runs exactly once, at the very end (see `rules/skills/executing-plans.md`) — that's a different pass with a different purpose, not something TDD's scoped runs replace or duplicate.

**Bug fixes go through TDD too:** write a failing test that reproduces the bug first, then fix it — mirrors `superpowers:test-driven-development`'s Debugging Integration.

**Exception — code review may write tests directly.** One carve-out remains: a review pass may add or fix a test directly when it finds an existing gap TDD didn't produce — legacy code with no tests, or a merge that dropped coverage. The behavior already exists in that case, so there's no test-first cycle to run; this is the one case where reviewing and writing tests happen in the same pass without a preceding red step.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Re-running the *full* suite after every file edit mid-task | Save the full build/lint/whole-suite run for the plan's single final pass — TDD's own scoped single-test run is the thing that happens per edit, not the full suite |
| Writing implementation code before its test | Write the failing test first, watch it fail, then minimal code — no exceptions without the user's explicit permission |
| Adding a test-first cycle for a layer `rules/base/testing.md` excludes, because TDD's checklist says "every function" | The layer table there still governs scope; TDD governs process/order for whatever's already in scope, not what's in scope |
| Under deadline/reviewer pressure, adding tests for a layer `rules/base/testing.md` excludes "just to show full coverage" | "Full coverage" means full coverage *per this convention* — a repository/API-client/component with no spec file is the correct, complete state, not a gap |
