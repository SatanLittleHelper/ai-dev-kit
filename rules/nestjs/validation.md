# Cross-Field Validation Gotcha

`@IsOptional()` and `@ValidateIf()` both suppress **every** decorator stacked on that property when their condition is false — not just their own check. Stacking a custom cross-field decorator (one reading sibling properties via `args.object`) on a property that's also `@IsOptional()`-guarded means the exact case you need to catch (that property being empty) is the case where the cross-field check silently never runs.

Fix by normalizing instead of gating: use `@Transform(({ value }) => value ?? '')` (class-transformer, runs before `class-validator`) so the field is never `undefined` by validation time — no gating decorator needed, and any cross-field decorator on it always runs.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Cross-field decorator on an `@IsOptional()` property | Normalize via `@Transform`, drop the gate |
