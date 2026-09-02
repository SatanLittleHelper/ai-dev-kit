# Splitting a Growing Module

| Content | Goes in |
|---|---|
| More than one type/interface | `*.types.ts` |
| Constants | `*.constants.ts` |
| Pure builder/formatting functions (no side effects, no DI) | `*.helpers.ts` — keep separate from `*.constants.ts`; a `const` and a `function` aren't the same kind of thing even in the same domain |
| Pure row/payload → domain-type mappers (field-by-field reassignment, no branching beyond `?? default`) | `*.mapper.ts` — separate from `*.helpers.ts`, which is for real formatting/builder logic |
| Type guards (`x is T` predicates) | Next to the type they narrow, in the same `*.types.ts` — not in `*.helpers.ts` or standalone. A guard is defined by the type it protects, not by merely being a function |
| The class/handler itself | Only the class and its imports — everything above lives elsewhere |

**Barrels:** `index.ts` exports only the public API — never re-export internal types. A folder that itself contains only several class dot-subfolders (a `services/` grouping folder holding `*.service/`, `*.resolver/`, etc.) gets its own aggregating `index.ts`, re-exported for outside consumers (`from './services'`). Siblings inside the group still import each other by direct relative path, not through the aggregating barrel — routing sibling imports through it risks an import cycle through the barrel itself.

**Test co-location:** any unit with a test lives in a dot-notation subfolder with a local `index.ts` barrel — `some-service/some-service.ts` + `some-service/some-service.spec.ts` + `some-service/index.ts`. Plain constants/types files with no test stay flat. Exclude `*.mapper.ts` from your test runner's discovery/coverage config (e.g. `exclude: ['src/**/*.mapper.ts']`) rather than writing a spec for it — pure mappers don't get unit tests (see `rules/base/testing.md`).

## Common Mistakes

| Mistake | Fix |
|---|---|
| A `*.mapper.ts` function with real branching/formatting logic | That's a helper, not a mapper — move it to `*.helpers.ts` |
| Type guard living in `*.helpers.ts` | Move it next to the type it narrows, in `*.types.ts` |
