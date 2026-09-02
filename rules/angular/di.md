# DI: `inject()` Only

Constructor-parameter injection (`constructor(private readonly foo: Foo) {}`) is forbidden for components, services, resolvers, guards.

- Used by more than one method, or must survive past the constructor → assign to a `private readonly` field at the top of the class.
- Used exactly once, synchronously, in the constructor body → a local `const` there, or inline at the point of use.
- **Closure trap:** `inject()` must run synchronously in an injection context (a field initializer or the constructor body). A callback handed to something else — an RxJS operator, `setTimeout`, a function assigned for later invocation — is not an injection context. Capture the dependency into a field/local `const` *before* building the callback and let it close over that variable; never call `inject()` inside the callback itself.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `constructor(private readonly x: X)` | `private readonly x = inject(X);` (or local `const` for one-off constructor use) |
| `inject()` called inside an RxJS operator callback or `setTimeout` | Capture into a field/const before the callback, close over it |
