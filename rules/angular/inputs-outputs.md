# Inputs & Outputs: Signal-Based Only

`input()` / `input.required()` from `@angular/core`; `@Input()` is forbidden. A setter input (`@Input() set foo(v)`) becomes `readonly foo = input<T>()` + `effect(() => {...})` in the constructor. Call input signals with `()` in templates: `[attr]="foo()"`.

`output<T>()` instead of `@Output()` + `EventEmitter`; `this.foo.emit(value)` and the parent's `(foo)="handler($event)"` binding stay unchanged.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `@Input()`/`@Output()` | `input()`/`input.required()`, `output<T>()` |
