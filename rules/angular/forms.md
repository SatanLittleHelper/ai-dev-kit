# Forms

Two mutually exclusive approaches, chosen by the project's actual Angular version — **check `@angular/core` in the project's `package.json` before writing any form code**, don't assume. Angular 22+ projects that have adopted Signal Forms use that section exclusively; everything below Angular 22, or an Angular 22+ project that hasn't migrated yet, uses Reactive Forms.

| `@angular/core` | Use |
|---|---|
| ≥ 22, Signal Forms adopted (check for `@angular/forms/signals` usage in the codebase) | Signal Forms |
| < 22, or 22+ not yet migrated | Reactive Forms |

## Reactive Forms (Angular < 22, or not yet migrated)

Only `ReactiveFormsModule` (`FormControl`, `FormGroup`) — never `[(ngModel)]`/`FormsModule`, except inside a `ControlValueAccessor` implementation where `ngModel` is the CVA's own internal mechanism.

Build with `inject(NonNullableFormBuilder)`, never `new FormGroup(...)` by hand. Every control is `nonNullable: true`; an optional field is `T | undefined`, initialized `undefined` — not `null`.

### Common Mistakes

| Mistake | Fix |
|---|---|
| `new FormBuilder()` / `new FormGroup(...)` | `inject(NonNullableFormBuilder)` |

## Signal Forms (Angular 22+, `@angular/forms/signals`)

`FormsModule`, `[(ngModel)]`, and `ReactiveFormsModule` (`FormControl`/`FormGroup`/`NonNullableFormBuilder`) are not used in new code once a project has adopted Signal Forms.

The form model is a signal holding a plain object; the schema is a separate function:

```typescript
readonly model = signal({ lastName: '', firstName: '', citizenship: '' });
readonly personForm = form(this.model, (path) => {
  required(path.lastName, { message: 'Укажите фамилию' });
});
```

A field is bound to a control through the **`FormField` directive** (`[formField]`, imported from `@angular/forms/signals` and added to the component's `imports`) — not through a hand-written `[field]` attribute, which is not a real Angular selector in this package. Bind the `FieldTree` node itself, not a called/invoked form of it:

```typescript
import { form, FormField } from '@angular/forms/signals';

@Component({
  imports: [FormField, InputComponent],
  // ...
})
```

```html
<ui-input label="Фамилия" [formField]="personForm.lastName" />
```

Field state (`touched`, `errors`, `disabled`) is read from the field itself instead of being duplicated in the component. `FormField` already works with any component implementing `FormValueControl`/`FormCheckboxControl` (including third-party `ControlValueAccessor`s) — see below for how a UI-kit component exposes that.

### Custom controls — `FormValueControl`, not `ControlValueAccessor`

A UI-kit component that holds a user-entered value implements `FormValueControl<T>` from `@angular/forms/signals` and keeps the value in a `model()`:

```typescript
export class InputComponent implements FormValueControl<string> {
  readonly value = model('');
}
```

Checkboxes and toggles use `FormCheckboxControl` with `checked = model(false)`. `NG_VALUE_ACCESSOR`, `forwardRef`, `writeValue`/`registerOnChange`/`registerOnTouched`/`setDisabledState` are not written in new components.

### Third-party CVA libraries

A third-party component that is itself a `ControlValueAccessor` (`ng-select` and similar) is **not** wired into Signal Forms directly: inside the kit component it is bound to a local signal, and the kit component exposes its own `model()` to the outside. The bridge from `@angular/forms/signals/compat` is allowed only where a local binding is not enough, and its use is explained by a code comment. A single control must never have two owners of its value.

Directives that do not own the value (`@maskito/angular` masks and similar) are attached to the native `<input>` with no wrapper in between.

### Validation

Validation lives in the form schema, not in the control component. A kit component displays the error text it is given and never decides whether a value is valid.

**A custom control reports validation through the `FormUiControl` inputs, never through a home-grown `errorMessage` input.** `FormUiControl` declares `errors`, `touched`, `disabled`, `required`, `readonly` and the `touch` output as _optional inputs the control declares itself_ — the `FormField` directive writes into whichever of them exist. So a control that wants a piece of field state must declare that input; a control that wants its blur to mark the field touched must declare `touch = output<void>()` and emit it on `blur`. Render the message with a `protected computed` over `errors()` (typically `errors()[0]?.message`, shown once `touched()`), and pass that string down to the presentational wrapper. Never accept a validation verdict as a plain string input on a control that implements `FormValueControl` — that bypasses the form state and forces the consumer to unpack the form by hand. Presentational wrappers that implement no form interface (`ui-field`) are the exception: they legitimately take the final string.

### Common Mistakes

| Mistake | Fix |
|---|---|
| `[(ngModel)]`, `FormControl`/`FormGroup`, `NonNullableFormBuilder` in a Signal Forms project | Use `form()` + `FormField` + `FormValueControl`/`FormCheckboxControl` instead |
| Hand-written `[field]` attribute binding | `[formField]="personForm.path"`, binding the `FieldTree` node itself |
| A custom control implementing `ControlValueAccessor` for a Signal Forms project | Implement `FormValueControl`/`FormCheckboxControl` instead — reach for the `signals/compat` bridge only for third-party CVAs that can't be changed |
| A control taking a home-grown `errorMessage` string input | Declare the `FormUiControl` inputs (`errors`, `touched`, etc.) so `FormField` can write into them |
