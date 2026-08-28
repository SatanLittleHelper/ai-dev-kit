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

## Reactive Forms

Only `ReactiveFormsModule` (`FormControl`, `FormGroup`) — never `[(ngModel)]`/`FormsModule`, except inside a `ControlValueAccessor` implementation where `ngModel` is the CVA's own internal mechanism.

Build with `inject(NonNullableFormBuilder)`, never `new FormGroup(...)` by hand. Every control is `nonNullable: true`; an optional field is `T | undefined`, initialized `undefined` — not `null`.

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
