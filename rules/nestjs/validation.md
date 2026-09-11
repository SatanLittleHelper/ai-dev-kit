# Cross-Field Validation Gotcha

`@IsOptional()` and `@ValidateIf()` both suppress **every** decorator stacked on that property when their condition is false — not just their own check. A cross-field decorator (reading sibling properties via `args.object`) is not exempt: gate it on the same property and it silently never runs in exactly the case it exists to catch.

`@Transform(({ value }) => value ?? '')` does not fix this — it only changes what the gate sees, and the gate still short-circuits every decorator on that property when the underlying key is genuinely absent from the payload (`@Transform` only runs for keys present on the source object). Put the cross-field decorator on a property that is never gated (a required field with no `@IsOptional()`/`@ValidateIf()`) — it reads the sibling fields via `args.object` regardless of which property it's declared on.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Cross-field decorator on an `@IsOptional()`/`@ValidateIf()` property | Move it to an always-validated (non-gated) property |
| "Fixing" the gate with `@Transform(({ value }) => value ?? '')` | Does not work when the key is absent, not just `undefined` — move the decorator instead |
