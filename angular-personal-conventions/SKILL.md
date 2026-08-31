---
name: angular-personal-conventions
description: Use when writing or reviewing Angular components, services, forms, or async/HTTP data flows to apply this developer's personal conventions on top of general Angular best practices.
---

# Angular Personal Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke `angular-best-practices` first — it covers generic modern Angular (signals, RxJS, performance, testing). This skill is a personal layer on top of it: DI, inputs/outputs, forms, and async-data conventions this developer applies to every Angular project.

Baseline testing (an agent asked to build a component with an input, output, reactive form, and HTTP-loaded data — no skill loaded) already defaults to `inject()`, signal-based `input()`/`output()`, and `NonNullableFormBuilder` on its own — modern Angular idioms are now mainstream enough that most of this layer reinforces rather than corrects. The one reliable gap: async HTTP data gets wired up with a manual `effect()` + `.subscribe()` + `onCleanup()` instead of `toSignal()`, which is more code doing the same job with a manual unsubscribe to get wrong.

## Quick Reference

| Concern | Rule |
|---|---|
| Dependency injection | `inject()` only — constructor-parameter injection is forbidden |
| Component inputs | `input()` / `input.required()` — `@Input()` decorator forbidden |
| Component outputs | `output<T>()` — `@Output()` + `EventEmitter` forbidden |
| Reactive forms | `NonNullableFormBuilder`, all controls `nonNullable: true`, optional fields `T \| undefined` (not `null`) |
| Async data from an Observable | `toSignal()` — not a manual subscription, not `effect()` + `subscribe()` |
| Imperative side-effect streams (not displayed data) | `takeUntilDestroyed()` — the one case `toSignal()` doesn't fit |
| Spacing between siblings | `margin-top` on the following element, never `padding-top` on a wrapper |
| Vertical stack of fixed children in one component | `grid` + `gap-*` on the container, not `flex flex-col` + repeated `mt-*` |

## Async Data: `toSignal()` Is the Default

This is the gap baseline testing actually finds — the rest of this skill mostly confirms what agents already do.

```typescript
// ❌ Baseline default: manual effect + subscribe + cleanup
constructor() {
  effect((onCleanup) => {
    const id = this.userId();
    const subscription = this.userService.getUser(id).subscribe({
      next: (user) => this.form.patchValue({ name: user.name }),
      error: () => this.errorMessage.set('Failed to load user'),
    });
    onCleanup(() => subscription.unsubscribe());
  });
}

// ✅ toSignal() manages the lifecycle via DestroyRef automatically
private readonly userService = inject(UserService);
protected readonly user = toSignal(
  toObservable(this.userId).pipe(switchMap((id) => this.userService.getUser(id))),
);

constructor() {
  effect(() => {
    const user = this.user();
    if (user) this.form.patchValue({ name: user.name });
  });
}
```

Without `initialValue`, the signal's type is `T | undefined` — this is a feature, not a gap: it lets you distinguish "still loading" from "empty result arrived." Use `startWith([])` inside a `switchMap` to reset the value on source change instead. In templates, narrow the type with `@let` + `@if`:

```html
@let items = mySignal();
@if (items) {
  <!-- items: T[], undefined excluded -->
}
```

`takeUntilDestroyed()` is not a substitute for `toSignal()` — reach for it only for imperative side-effect subscriptions that don't represent displayed data (reacting to a stream without turning it into a template-bound value). `OnDestroy` + manual `unsubscribe()` is forbidden either way.

## DI: `inject()` Only

Constructor-parameter injection (`constructor(private readonly foo: Foo) {}`) is forbidden for components, services, resolvers, guards.

- Used by more than one method, or must survive past the constructor → assign to a `private readonly` field at the top of the class.
- Used exactly once, synchronously, in the constructor body → a local `const` there, or inline at the point of use.
- **Closure trap:** `inject()` must run synchronously in an injection context (a field initializer or the constructor body). A callback handed to something else — an RxJS operator, `setTimeout`, a function assigned for later invocation — is not an injection context. Capture the dependency into a field/local `const` *before* building the callback and let it close over that variable; never call `inject()` inside the callback itself.

## Inputs & Outputs: Signal-Based Only

`input()` / `input.required()` from `@angular/core`; `@Input()` is forbidden. A setter input (`@Input() set foo(v)`) becomes `readonly foo = input<T>()` + `effect(() => {...})` in the constructor. Call input signals with `()` in templates: `[attr]="foo()"`.

`output<T>()` instead of `@Output()` + `EventEmitter`; `this.foo.emit(value)` and the parent's `(foo)="handler($event)"` binding stay unchanged.

## Component File Structure & Styling

- Split component files: `*.component.ts` + `*.component.html` mandatory — never inline `template`/`styles` in the decorator.
- `*.component.scss` only when there's real CSS the utility framework can't express (a custom animation, etc.) — never create an empty SCSS file "just in case."
- Styles are exclusively utility classes (Tailwind or equivalent) in the template — font sizes, spacing, colors only through utility classes, no hardcoded pixel values in component styles.
- **Block-level components set `host: { class: 'block' }`:** any standalone component meant to occupy its own layout block (not an inline control) sets this in `@Component`, so it renders `display: block` by default — don't rely on every consumer remembering to add a `block` utility class themselves; consumers should only pass spacing/margin classes. Reference (chatbot-platform): `apps/miniapp/src/app/shared/components/file-uploader/file-uploader.component.ts`, `.../select/select.component.ts`.
- **Programmatic scroll — `ViewportScroller`, not raw `window.scrollTo`:** when a component/service needs to scroll the page programmatically, inject `ViewportScroller` from `@angular/common` and call `scrollToPosition([x, y])` — Angular's own DOM abstraction, consistent with `inject()`-only DI. Reference: `apps/miniapp/src/app/shared/services/paginated-list-controller/paginated-list-controller.ts`.
- **Component built but not yet wired into the app** (no route, no parent template references it): don't skip visual verification silently. Propose a demo page instead of just running build/lint/tests — a **public route**, reachable without auth, so it can be opened standalone during development. This is a suggestion to make to the user, not an automatic action; remove the demo route once the component is wired into its real place.
- **Date formatting in templates — through a pipe, never inline `dayjs(...).format(...)` in the component class.** A formatting pipe that accepts either a UTC timestamp (converted to local) or an already-local calendar value, plus an optional format-string argument, keeps date formatting out of component logic and reusable across templates. Reference: `FormatDatePipe`/`formatDate` (`apps/miniapp/src/app/shared/pipes/format-date.pipe.ts`); the format string itself belongs in the consuming component's own constants file, not a template literal.

## Taiga UI Library Notes (when the project uses Taiga UI)

- **`tuiLabel` auto-shrinks its font unless it wraps a control:** Taiga's `TuiLabel` directive switches between a larger and smaller typography token depending on whether the label wraps a data-list-host-like descendant (`tui-textfield`, `tui-select`, etc.) — an ordinary field label ends up smaller, a bare text label above something else (e.g. a file input) stays larger. Don't patch this per-component; fix it once globally in your cross-cutting Taiga override stylesheet with a selector specific enough to win without `!important` (element + attribute beats Taiga's own `:where()`-scoped rule). Reference: `label[tuiLabel] { font: var(--tui-typography-body-m); }` in `apps/miniapp/src/styles/taiga.scss`.
- **Tailwind color tokens scoped to `bg-*` only:** when mapping a Taiga CSS variable into a Tailwind class and the token is only ever meant as a background, add it under `theme.extend.backgroundColor`, not the general `theme.extend.colors` palette — putting it in `colors` makes it usable (and misusable) as `text-*`/`border-*` too. Reference: `bg-tui-base` → `--tui-background-base` in `apps/miniapp/tailwind.config.js`.

## Pagination

**Prefer plain pagination over infinite/virtual scroll for card-style lists**, unless the list is long enough that rendering everything at once is a real performance problem. Infinite scroll with dynamic item-height measurement combined with a card component's drop shadow is a known source of clipped/oversized-shadow visual artifacts at scroll-container edges — plain pagination has predictable content height and avoids the whole bug class.

**Reusable pagination controller pattern:** a plain class (not a DI service) holding `items`/`isLoading`/`pageIndex`/`pageCount` as signals, constructed inside a component's constructor with its dependencies (`firstPage` from a route resolver, `fetchPage` the API call, `destroyRef`, a scroll service) `inject()`-ed by the caller and passed in — the controller itself is never registered in DI. Its page-change handler guards against redundant requests: re-clicking the current page, clicking out of range, or clicking mid-flight are all no-ops. Reuse one shared implementation across every paginated list instead of writing bespoke pagination state per feature. Reference: `PaginatedListController` (`apps/miniapp/src/app/shared/services/paginated-list-controller/`).

**Fixed pagination bar pattern:** when a paginated list can grow taller than the viewport, don't rely on flex layout (`min-h-0`/`flex-1`/an internal scroll container) to pin the pagination control to the bottom — it's fragile and a known source of background/shadow visual regressions. Let the page scroll naturally and give the pagination bar a fixed position at the bottom of the viewport instead, reserving matching bottom padding on the list content so the last item isn't hidden underneath. Only render the bar when there's more than one page.

## Routing

Use lazy loading via the router's component-loading mechanism (e.g. Angular's `loadComponent`) rather than eagerly declared route components.

## Typography & Design-Scale Porting

When porting text/spacing px values from a design tool into utility classes, pick the nearest class on the framework's standard scale — don't apply a scaling adjustment, and don't use arbitrary bracket/one-off values (`text-[Npx]`, `pt-[Npx]`) for font size or spacing. This only holds when the app's root font-size is the framework's unscaled default (verify — an app that *does* override root font-size needs the opposite: an explicit scaling adjustment when porting).

## Reactive Forms

Only `ReactiveFormsModule` (`FormControl`, `FormGroup`) — never `[(ngModel)]`/`FormsModule`, except inside a `ControlValueAccessor` implementation where `ngModel` is the CVA's own internal mechanism.

Build with `inject(NonNullableFormBuilder)`, never `new FormGroup(...)` by hand. Every control is `nonNullable: true`; an optional field is `T | undefined`, initialized `undefined` — not `null`.

## `HttpParams` and `undefined`

Angular's `HttpParams` (including via `fromObject`) does **not** ignore `undefined` values — it serializes them to the literal string `"undefined"` (verified against the actual `HttpParams` class in `@angular/common`). Passing an object with optional/conditional fields straight into `params` silently produces a query string like `?filter=undefined` instead of omitting the parameter. Build optional/conditional query parameters through a small helper that filters out `undefined` entries before constructing `HttpParams`, instead of passing the raw object in directly.

## HTTP Headers and `FormData`: Centralize in the API-Service Layer

**Custom HTTP headers go through an `HttpInterceptor`, never set manually in individual services.** Keep every custom header name in one shared enum/constant, not scattered string literals across services — a header renamed in one place should not require hunting through every service that sets it.

**`FormData` for multipart requests is assembled inside the `*.api.service.ts` method itself, never by the calling component.** The API method accepts a typed payload object (mirroring the shared request contract) and builds `FormData` internally before the `HttpClient` call. Passing a pre-built `FormData` into an API method loses the type guarantee that the request body actually matches the expected contract — the component could put anything into it.

```typescript
// ❌ Component builds FormData itself — no type guarantee on the body
const formData = new FormData();
formData.append('comment', this.comment());
this.api.addComment(formData);

// ✅ API service accepts a typed payload, builds FormData internally
addComment(payload: AddCommentRequest): Observable<void> {
  const formData = this.formDataService.build(payload);
  return this.http.post<void>(url, formData);
}
```

**Migration debt is normal — expect exceptions.** When adopting this pattern in an existing codebase, some call sites will predate it and still pass a pre-built `FormData` in from the component. Don't treat that as "an alternative style" — mark it explicitly as tech debt (a `// TODO` at each pre-existing call site) and track the concrete list of not-yet-migrated methods/components, so the debt doesn't get silently normalized into "how it's sometimes done here."

Reference (chatbot-platform): headers centralized in `ApiHeaders` (`libs/api-interfaces/src/lib/api.ts`); optional-params helper `buildHttpParams` (`apps/miniapp/src/app/shared/helpers`); FormData-in-API-service done right in `CareIncidentsApiService.addComment` via `FormDataService.build()` (`apps/miniapp/src/app/services/form-data.service/form-data.service.ts`). Known not-yet-migrated exceptions there: `CareApiService.createIncident` (still takes pre-built `FormData` from `care.component.ts`) and `AhoApiService.createRequest`/`createPhotoRequest` (still takes pre-built `FormData` from `AhoService`, `apps/miniapp/src/app/pages/aho/aho.service.ts`) — both have `// TODO` markers at the call sites.
```

## Testing Note: jsdom ↔ Native `fetch` Interop Gotcha

jsdom doesn't implement the Fetch API, but it does replace the global `Blob`/`File` with its own DOM classes — a *different* class than the one the test runner's native `fetch`/`Response` (e.g. undici under Node/Vitest) expects. A test that round-trips a `Blob` through `new Response(blob)` / `response.blob()` sees the body's `Content-Type` collapse to `text/plain;charset=utf-8` instead of preserving the original blob's `type`, because `Response` no longer recognizes the jsdom `Blob` as `instanceof` its own `Blob`. Fix per-file, not by reverting the whole app to a non-DOM environment: add a per-file environment override (e.g. Vitest's `// @vitest-environment node` as the file's first line) on just the spec file that hits this, so the rest of the suite keeps jsdom.

## Layout Spacing

- **Margin, not padding, between siblings:** `mt-*` on the element *after* the gap, never `pt-*` on a wrapper just to create separation from a preceding sibling — padding is space inside a box, margin is space between boxes. `mt-auto` for "stick to the bottom" only works when the element is a direct flex/grid item of a flex/grid container — it's a silent no-op otherwise.
- **`grid` + `gap-*` for a fixed vertical stack inside one component:** when a component's own template stacks a fixed sequence of child blocks with even spacing, put `grid gap-*` on the stacking container instead of `flex flex-col` with a repeated `mt-*` on every child after the first — the spacing is stated once, on the container, instead of duplicated per child. This is specifically for the *outer vertical stack of one component's own children* — horizontal inline rows (icon + label) stay `flex items-center gap-*`, and spacing *between separate composed components* on a page stays margin (there's no shared container to own a `gap`).

## Common Mistakes

| Mistake | Fix |
|---|---|
| `effect()` + manual `.subscribe()` + `onCleanup()` for HTTP data | `toSignal()` (+ `toObservable()`/`switchMap` if driven by another signal) |
| `constructor(private readonly x: X)` | `private readonly x = inject(X);` (or local `const` for one-off constructor use) |
| `inject()` called inside an RxJS operator callback or `setTimeout` | Capture into a field/const before the callback, close over it |
| `@Input()`/`@Output()` | `input()`/`input.required()`, `output<T>()` |
| `new FormBuilder()` / `new FormGroup(...)` | `inject(NonNullableFormBuilder)` |
| `padding-top` on a wrapper to separate it from the element above | `margin-top` on the element itself |
| Repeated `mt-*` on every child of a fixed vertical stack | `grid gap-*` on the container |
