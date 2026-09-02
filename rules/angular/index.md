# Angular Personal Conventions

**REQUIRED SUB-SKILL:** Invoke `angular-best-practices` first — it covers generic modern Angular (signals, RxJS, performance, testing). This directory is a personal layer on top of it: DI, inputs/outputs, forms, and async-data conventions this developer applies to every Angular project.

Baseline testing (an agent asked to build a component with an input, output, reactive form, and HTTP-loaded data — no rule loaded) already defaults to `inject()`, signal-based `input()`/`output()`, and `NonNullableFormBuilder` on its own — modern Angular idioms are now mainstream enough that most of this layer reinforces rather than corrects. The one reliable gap: see `async-data.md`.

## Quick Reference

| Concern | Rule | File |
|---|---|---|
| Dependency injection | `inject()` only — constructor-parameter injection is forbidden | `di.md` |
| Component inputs/outputs | `input()`/`input.required()`, `output<T>()` — decorators forbidden | `inputs-outputs.md` |
| Async data from an Observable | `toSignal()` — not a manual subscription | `async-data.md` |
| Forms | Version-gated: Reactive Forms below Angular 22, Signal Forms (`@angular/forms/signals`) at 22+ once adopted — check `@angular/core` in the project first | `forms.md` |
| Component structure, styling, Taiga UI, layout spacing | See file | `component.md` |
| Pagination pattern | Plain pagination, reusable controller, fixed bottom bar | `pagination.md` |
| Routing | Lazy-loaded route components | `routing.md` |
| Porting design px values | Nearest scale class, no arbitrary bracket values | `typography.md` |
| `HttpParams`/headers/`FormData`, jsdom gotcha | See file | `http.md` |

Read the specific file(s) the current task touches — this index is the map, not a substitute for reading them. `@import` doesn't apply here: this directory is on-demand, reached via `Read`, not via the always-on `rules/RULES.md` chain — `Read` doesn't resolve `@file.md` references, so read each needed file explicitly by its path (`rules/angular/di.md`, etc.).
