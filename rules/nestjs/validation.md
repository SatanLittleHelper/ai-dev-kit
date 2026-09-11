# Cross-Field Validation Gotcha

`@IsOptional()` and `@ValidateIf()` both suppress **every** decorator stacked on that property when their condition is false — not just their own check. A cross-field decorator (reading sibling properties via `args.object`) is not exempt: gate it on the same property and it silently never runs in exactly the case it exists to catch.

`@Transform(({ value }) => value ?? '')` does not fix this — it only changes what the gate sees, and the gate still short-circuits every decorator on that property when the underlying key is genuinely absent from the payload (`@Transform` only runs for keys present on the source object).

Fix by making the decorator class-level instead of property-level: apply it via `registerDecorator({ target, propertyName: '', ... })` with the decorator function typed as `ClassDecorator` (applied above `export class Foo {`, not on a field). `class-validator` groups validation metadata by `propertyName`; `''` is a key no `@IsOptional()`/`@ValidateIf()` ever gates, so the check runs unconditionally regardless of which fields it reads via `args.object`. Putting it on an unrelated always-required field instead works too but is fragile (nothing ties the decorator's placement to the fields it validates) — prefer class-level.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Cross-field decorator on an `@IsOptional()`/`@ValidateIf()` property | Make it class-level (`propertyName: ''`), or move it to an always-validated property as a fallback |
| "Fixing" the gate with `@Transform(({ value }) => value ?? '')` | Does not work when the key is absent, not just `undefined` — use a class-level decorator instead |
