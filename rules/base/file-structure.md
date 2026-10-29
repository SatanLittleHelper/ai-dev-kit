# Splitting a Growing Module

| Content | File |
|---|---|
| Any type/interface, even a single one | `*.types.ts` |
| Constants | `*.constants.ts` |
| Pure builders/formatters without side effects or DI | `*.helpers.ts` |
| Pure row/payload → domain mappers with no branching beyond `?? default` | `*.mapper.ts` |
| Type guards | Beside the narrowed type in `*.types.ts` |
| Class/handler | Only the class and imports |

Exception — Storybook stories: a story module and its support files (`*.stories.ts`, story-opening helpers such as `stories.ts` in an e2e `support/` folder) are not split by this table. Types, pure formatters, and the side-effecting function may stay together in one file; do not split them into `*.types.ts`/`*.helpers.ts`.

Exception — test data: values used only by tests (seeds, fixtures, test-config timeouts) stay in the test file or its test-support file and are not moved to `*.constants.ts`. Each still gets a name; see `rules/base/testing.md` → "Assertions".

Keep mappers separate from helpers. Every folder that contains more than one file exposes its public API through an `index.ts`; code outside the folder imports from the folder (`../health`), never from its individual files. Files inside the same folder import one another directly. A single-file folder needs no barrel. A barrel exports only the public API; never re-export internal types. A grouping folder containing class dot-subfolders may have an aggregating `index.ts`, but siblings import one another directly to avoid cycles.

Tested units use a dot-notation subfolder and local barrel (`some-service/some-service.ts`, `.spec.ts`, `index.ts`). Untested constants/types stay flat. Exclude pure `*.mapper.ts` files from test discovery/coverage.
