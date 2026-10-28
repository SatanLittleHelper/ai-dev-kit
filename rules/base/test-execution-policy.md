# Test Execution Policy: TDD by Default

This file defines when and in what order tests are written and run. `rules/base/testing.md` defines what deserves a test.

- TDD applies to every layer that `testing.md` marks as test-worthy. Invoke `superpowers:test-driven-development` and repeat: one failing test → verify the right failure → minimal implementation → verify green → refactor.
- The same agent/pass writes the test first and the implementation second. Do not split these into separate default roles.
- The scope is bounded by `testing.md`: components, thin repositories/API clients, and pure mappers remain excluded even if a generic TDD checklist says “every function”.
- Bug fixes start with a failing regression test.
- Scoped red/green runs happen throughout the task: after each step, run the single test file you are working on. A project rule that forbids running tests automatically applies to the full suite and e2e, not to this loop. The full build/type-check/lint/whole-suite pass runs once at the end; these are different checks.
- A change that touches only Markdown files skips the TDD loop and the final test pass entirely (`rules/base/testing.md` → Scope).
- If the layer a change needs has no test infrastructure, follow `rules/base/testing.md` → "Missing Test Infrastructure": stop and insist on adding it. The test is never dropped.
- A review may add a test directly for a pre-existing gap or a merge regression; this is the only exception to test-first.

## TDD workflow

| Layer | Test type | Loop run |
|---|---|---|
| Backend services, guards, validators | unit, dependencies mocked | scoped run of the spec file |
| Repositories with query logic | integration, real database | scoped run of the integration spec |
| HTTP contract, authorization | backend e2e | scoped run of the e2e spec. Whole e2e once at the end |
| Frontend stores, services, helpers, validators | unit | scoped run of the spec file, without coverage |
| Application pages | fast e2e, mocked API | scoped run of the page spec |
| Cross-system scenarios | full-stack e2e | not in the loop. Once at the end |
| UI-kit components | story → e2e spec → component | scoped run of the e2e spec for the story |

The concrete commands live in the project's `CLAUDE.md`. A row with no command there means the layer has no infrastructure: see `rules/base/testing.md` → "Missing Test Infrastructure".

## Common Mistakes

| Mistake | Fix |
|---|---|
| Full suite after every edit | Run the scoped test during TDD; reserve the full pass for the end |
| Implementation before test | Write and observe the failing test first |
| Test excluded layers for “full coverage” | Follow `testing.md`'s layer table |
| Treating "do not run tests automatically" as a ban on the red/green loop | The ban covers the full suite and e2e; run the single spec after each TDD step |
| Skipping a test because the layer has no infrastructure | Stop and insist on adding it; fall back only on the user's explicit choice |
