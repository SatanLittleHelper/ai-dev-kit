# Splitting a Growing Module

| Content | File |
|---|---|
| More than one type/interface | `*.types.ts` |
| Constants | `*.constants.ts` |
| Pure builders/formatters without side effects or DI | `*.helpers.ts` |
| Pure row/payload → domain mappers with no branching beyond `?? default` | `*.mapper.ts` |
| Type guards | Beside the narrowed type in `*.types.ts` |
| Class/handler | Only the class and imports |

Keep mappers separate from helpers. A barrel exports only the public API; never re-export internal types. A grouping folder containing class dot-subfolders may have an aggregating `index.ts`, but siblings import one another directly to avoid cycles.

Tested units use a dot-notation subfolder and local barrel (`some-service/some-service.ts`, `.spec.ts`, `index.ts`). Untested constants/types stay flat. Exclude pure `*.mapper.ts` files from test discovery/coverage.
