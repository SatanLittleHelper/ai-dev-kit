# Async Data: `toSignal()` Is the Default

Baseline testing (an agent asked to build a component with an input, output, reactive form, and HTTP-loaded data — no rule loaded) reliably wires up async HTTP data with a manual `effect()` + `.subscribe()` + `onCleanup()` instead of `toSignal()`, which is more code doing the same job with a manual unsubscribe to get wrong. This is the one reliable gap baseline testing finds in an otherwise-modern Angular agent.

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

`takeUntilDestroyed()` is not a substitute for `toSignal()` — reach for it only for imperative side-effect subscriptions that don't represent displayed data (reacting to a stream without turning it into a template-bound value). `OnDestroy` + manual `unsubscribe()` is forbidden either way — **every** subscription must be tied to `DestroyRef` through one of these two mechanisms, with no exceptions carved out for "it's just one quick subscribe." A `.subscribe()` call with no `toSignal()`/`takeUntilDestroyed()` around it leaks past the component's destruction: the callback keeps firing (and, for HTTP polling/streams, keeps holding the connection open) after the component is gone, which is the concrete bug this rule exists to prevent — not just a style preference for less code.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `effect()` + manual `.subscribe()` + `onCleanup()` for HTTP data | `toSignal()` (+ `toObservable()`/`switchMap` if driven by another signal) |
| `.subscribe()` with no `toSignal()`/`takeUntilDestroyed()`/manual `unsubscribe()` at all — subscription silently never cleaned up | `toSignal()` for displayed data, `takeUntilDestroyed()` for side-effect subscriptions — never leave a bare `.subscribe()` |
| `OnDestroy` + stored `Subscription` + manual `unsubscribe()` | Same two mechanisms above — manual `OnDestroy` cleanup is forbidden even when technically correct |
