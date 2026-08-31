---
name: ts-code-style-conventions
description: Use when writing or reviewing TypeScript code — naming, class member ordering, method signatures, or splitting a module into files — regardless of framework.
---

# TypeScript Code Style Conventions

## Overview

This developer's personal TypeScript style, independent of framework — applies equally to a NestJS service, an Angular component, or a plain library module. Layer this under any stack-specific skill (`nestjs-personal-conventions`, `angular-personal-conventions`); it governs naming and structure, not architecture.

## Quick Reference

| Concern | Rule |
|---|---|
| Interface/type naming | No `Interface` suffix, no meaningless filler words (`Data`, `Info`) |
| Field ordering | Required fields first, optional (`field?: T`) last — in interfaces, types, and DTO/class fields |
| Non-null assertion (`!`) | Forbidden outside the one documented DTO-validation exception (see `nestjs-personal-conventions`) |
| Class member ordering | Inputs → outputs → fields (public→protected→private) → constructor → methods (public→protected→private) |
| Method parameters | 3+ params → one named object, destructured |
| Blank lines in a method body | Separate logical groups (guard clauses, data prep, calls, result handling) |
| `let` + later reassignment | Extract to a function that returns the value; assign a `const` from its call |
| Magic numbers | Named constant or arithmetic from obvious base units, never an opaque literal |
| Module growing past one file | Split by kind — see the table below |

## Naming

- **No `Interface` suffix** on any interface/type name (`CreateUserRequest`, not `CreateUserRequestInterface`).
- **No filler words** (`Data`, `Info`, etc.) when the rest of the name already conveys the meaning (`IncidentHistoryEntry`, not `IncidentHistoryEntryData`). `Request`/`Response` are not filler — they designate direction (what's sent vs. what comes back) and stay meaningful; the entity name itself shouldn't be replaced by them.
- **Field ordering:** required fields first, optional (`field?: T`) last, in interfaces, types, and DTO/class field declarations. No exceptions.
- **Non-null assertion (`!`) is forbidden** everywhere except the one narrow, documented exception for framework-validated DTO fields (see the relevant stack skill, e.g. `nestjs-personal-conventions`) — use explicit guards or narrowed types instead.
- **A pass-through payload parameter is named `payload`, not `request`.** When a method accepts a single already-assembled object and simply forwards it (an outbound HTTP call, an event publish), `payload` reads as "the thing I'm sending," while `request` collides with the inbound-request meaning used elsewhere in the same codebase.

## Class Structure

Apply this member order in every class, in any framework: **inputs → outputs → fields by visibility (public → protected → private) → constructor → methods by visibility (public → protected → private).** "Inputs"/"outputs" mean whatever the framework's own input/output primitives are (e.g. Angular's `input()`/`output()`); classes without that concept just skip those two slots. Callback fields that exist to satisfy an interface (an event handler, a lifecycle hook) go in the fields section by their actual visibility — not pinned to the top just because they're callbacks.

**Blank lines between logical blocks inside a method body:** separate guard clauses, data preparation, the actual calls, and result handling with a blank line. No exceptions — a method that reads as one dense paragraph is harder to scan than the same logic with its phases visually separated.

**3+ parameters → one named object, destructured.** Once a function, method, or constructor takes three or more parameters, collapse them into a single named object parameter instead of a flat positional list — for public and private methods alike. Declare the object's type inline or in a nearby `*.types.ts` file.

```typescript
// ❌ four positional params — call sites need the doc comment to be readable
function scheduleNotification(userId: number, channel: string, delayMs: number, retry: boolean) {}

// ✅ one destructured object — call sites are self-describing
function scheduleNotification({ userId, channel, delayMs, retry }: ScheduleNotificationParams) {}
```

## Avoid `let` with Later Reassignment

Prefer a `const` assigned from an arrow function that returns the result, instead of `let x; try { x = ...; } catch { ... }`:

```typescript
// ❌ mutable let, reassigned inside try/catch
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  throw new Error('invalid JSON');
}

// ✅ const from a function that owns the try/catch
const parseJsonConfig = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid JSON');
  }
};
const parsed = parseJsonConfig(raw);
```

## No Magic Numbers

Express durations, TTLs, intervals, and retry counts as named constants or arithmetic from obvious base units (`60 * 60 * 1000`, or a shared `const`) — never an opaque literal like `900000`. Applies in both production and test code — a test's own timeout/delay values need names just as much as production ones.

## Splitting a Growing Module

| Content | Goes in |
|---|---|
| More than one type/interface | `*.types.ts` |
| Constants | `*.constants.ts` |
| Pure builder/formatting functions (no side effects, no DI) | `*.helpers.ts` — keep separate from `*.constants.ts`; a `const` and a `function` aren't the same kind of thing even in the same domain |
| Pure row/payload → domain-type mappers (field-by-field reassignment, no branching beyond `?? default`) | `*.mapper.ts` — separate from `*.helpers.ts`, which is for real formatting/builder logic |
| Type guards (`x is T` predicates) | Next to the type they narrow, in the same `*.types.ts` — not in `*.helpers.ts` or standalone. A guard is defined by the type it protects, not by merely being a function |
| The class/handler itself | Only the class and its imports — everything above lives elsewhere |

**Barrels:** `index.ts` exports only the public API — never re-export internal types. A folder that itself contains only several class dot-subfolders (a `services/` grouping folder holding `*.service/`, `*.resolver/`, etc.) gets its own aggregating `index.ts`, re-exported for outside consumers (`from './services'`). Siblings inside the group still import each other by direct relative path, not through the aggregating barrel — routing sibling imports through it risks an import cycle through the barrel itself.

**Test co-location:** any unit with a test lives in a dot-notation subfolder with a local `index.ts` barrel — `some-service/some-service.ts` + `some-service/some-service.spec.ts` + `some-service/index.ts`. Plain constants/types files with no test stay flat. Exclude `*.mapper.ts` from your test runner's discovery/coverage config (e.g. `exclude: ['src/**/*.mapper.ts']`) rather than writing a spec for it — pure mappers don't get unit tests (see `testing-philosophy`).

## Common Mistakes

| Mistake | Fix |
|---|---|
| `CreateUserRequestInterface`, `UserData` | Drop the `Interface` suffix and the filler word: `CreateUserRequest`, `User` |
| Optional fields mixed in before required ones | Required first, optional last — reorder |
| A 4-positional-parameter function | Collapse to one destructured object parameter |
| `let x; try { x = ...} catch {...}` | Extract to a function returning the value, assign a `const` from its call |
| A literal `86400000` for a TTL | Name it, or write `24 * 60 * 60 * 1000` |
| A `*.mapper.ts` function with real branching/formatting logic | That's a helper, not a mapper — move it to `*.helpers.ts` |
| Type guard living in `*.helpers.ts` | Move it next to the type it narrows, in `*.types.ts` |
