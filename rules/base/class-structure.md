# Class Structure

Apply this member order in every class, in any framework: **inputs → outputs → fields by visibility (public → protected → private) → constructor → methods by visibility (public → protected → private).** "Inputs"/"outputs" mean whatever the framework's own input/output primitives are (e.g. Angular's `input()`/`output()`); classes without that concept just skip those two slots. Callback fields that exist to satisfy an interface (an event handler, a lifecycle hook) go in the fields section by their actual visibility — not pinned to the top just because they're callbacks.

**Blank lines between logical blocks inside a method body:** separate guard clauses, data preparation, the actual calls, and result handling with a blank line. No exceptions — a method that reads as one dense paragraph is harder to scan than the same logic with its phases visually separated.

**3+ parameters → one named object, destructured.** Once a function, method, or constructor takes three or more parameters, collapse them into a single named object parameter instead of a flat positional list — for public and private methods alike. Declare the object's type inline or in a nearby `*.types.ts` file.

```typescript
// ❌ four positional params — call sites need the doc comment to be readable
function scheduleNotification(userId: number, channel: string, delayMs: number, retry: boolean) {}

// ✅ one destructured object — call sites are self-describing
function scheduleNotification({ userId, channel, delayMs, retry }: ScheduleNotificationParams) {}
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| A 4-positional-parameter function | Collapse to one destructured object parameter |
