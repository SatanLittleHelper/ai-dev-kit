# Test Execution Policy: TDD by Default

This file defines when and in what order tests are written and run. `rules/base/testing.md` defines what deserves a test.

- TDD applies to every layer that `testing.md` marks as test-worthy. Invoke `superpowers:test-driven-development` and repeat: one failing test → verify the right failure → minimal implementation → verify green → refactor.
- The same agent/pass writes the test first and the implementation second. Do not split these into separate default roles.
- The scope is bounded by `testing.md`: components, thin repositories/API clients, and pure mappers remain excluded even if a generic TDD checklist says “every function”.
- Bug fixes start with a failing regression test.
- Scoped red/green runs happen throughout the task. The full build/type-check/lint/whole-suite pass runs once at the end; these are different checks.
- A review may add a test directly for a pre-existing gap or a merge regression; this is the only exception to test-first.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Full suite after every edit | Run the scoped test during TDD; reserve the full pass for the end |
| Implementation before test | Write and observe the failing test first |
| Test excluded layers for “full coverage” | Follow `testing.md`'s layer table |
