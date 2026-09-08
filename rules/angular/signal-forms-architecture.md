# Signal Forms Architecture — Large/Multi-Section Forms

Applies once a Signal Forms form (see `forms.md` for the base mechanics) grows past a single flat model — multiple business sections, a step/wizard flow, or a model that needs to diverge from its API DTO. For a small single-section form, `forms.md` alone is enough; this file is the scaling story.

## One Source of Truth

The form's data lives in exactly one place: `signal<FormModel>`. Everything else — `dirty`, `touched`, `invalid`, per-field errors — is read from the `form()` tree it produces (`form.firstName().dirty()`, `.touched()`, `.invalid()`, `.errors()`), never duplicated as sibling boolean flags on the model (`firstNameTouched`, `isDirty`, …) or re-synced into a second signal (`dto`, `formState`) via `effect()`. If a second signal appears to be tracking the same editable data as the model, that's the bug to fix, not a pattern to repeat.

## FormModel vs. API DTO

Don't bind a component's form directly to the backend DTO shape when the UI's natural shape differs (nullable conventions, nesting, field grouping, nested dates vs. flat strings). Put a mapper between them:

```typescript
ApiDto → mapDtoToFormModel() → FormModel → form() → (submit) → mapFormModelToDto() → ApiDto
```

```typescript
this.model.set(mapDtoToFormModel(dto));         // load
const dto = mapFormModelToDto(this.model());     // save
```

This is what lets the API shape, UI shape, date formatting, nullability, and helper UI-only fields evolve independently. See `rules/base/file-structure.md` for where mapper functions live (`*.mapper.ts`) once they're non-trivial.

FormModel fields are chosen for what's convenient to edit, not for what the API sends — e.g. `Date | null` in the model even when the API sends an ISO string; the mapper does the conversion at the boundary. The same applies to enums, select options, money, files, phone numbers, and other composite fields. A section component works with the FormModel and never needs to know the API uses `snake_case` or a different structure — that translation happens once, above the section components, not inside them.

## Nullable Conventions

Pick one meaning per absent-value case per form and hold to it — don't let `undefined`, `null`, and `''` drift into meaning the same thing inconsistently across fields. A typical convention:

| Field kind | Empty value |
|---|---|
| Text input | `''` |
| Optional entity/reference | `null` |
| Date | `Date \| null` |
| Array | `[]` |
| Boolean | `boolean` (never nullable) |

Don't use `Partial<FormModel>` as the model type to sidestep this — an absent field should be a deliberate `null`/`''` in a fully-keyed interface, not a structurally-optional property. `Partial<T>` makes every read a guess about whether the key exists at all, which is a worse property for a form model than a slightly verbose initial-state object.

## Sectioning a Large Form

Don't build one flat model with dozens of fields. Group by business section, and let each section's boundary line up with a UI component where possible:

```typescript
interface ApplicationFormModel {
  personal: PersonalFormModel;
  contacts: ContactsFormModel;
  education: EducationFormModel;
  experience: ExperienceFormModel;
}
```

One logical business form gets **one root model and one `form()`**, even when it spans multiple steps/tabs/screens — not an independent `signal()` + `form()` per step:

```text
❌ PersonalStep → signal() → form()          ✅ ApplicationComponent
   ContactsStep → signal() → form()             signal<ApplicationFormModel>
   EducationStep → signal() → form()                  └─ form()
                                                          ├─ personal
                                                          ├─ contacts
                                                          └─ education
```

A section component receives only its own branch of the form as an input — it does not create a model, does not call `form()`, and is not a second source of truth:

```html
<app-personal-form [form]="form.personal" />
```

A section component owns rendering, layout, local error display, and local UI behavior for its branch. It does not own: loading or saving the whole form, aggregating sibling sections' data, or creating any parallel copy of form state. Prefer `input.required<FieldTree<...>>()` for the branch it receives over reaching for a shared form via `inject()` — a reusable section component's dependency on "which form" should be visible in its own API, not hidden behind an injected service.

### Naming the `FieldTree` Input: `form` vs. `field`

Name the input by what the `FieldTree` actually wraps, not by habit:

- **`FieldTree<CompoundType>`** — an object with its own nested fields, or an array of rows (`FieldTree<PersonalFormModel>`, `FieldTree<Row[]>`) — the component is a **section**, so the input is `form`: `readonly form = input.required<FieldTree<PersonalFormModel>>();`, bound as `[form]="form.personal"`.
- **`FieldTree<string | number | boolean | null>`** (or a union of those) — a single scalar leaf — the component is a **field-level control's consumer**, so the input stays `field`: `readonly field = input.required<FieldTree<number | null>>();`, bound as `[field]="form.vacancyId"`.

A component whose input is a compound `FieldTree` but is still named `field` (or a business-specific variant like `applicationField`) reads as if it holds one value when it actually holds a whole sub-form — rename it to `form` the same way the section-component example above already does. This is a naming rule only; it doesn't change how the value is read (`this.form()().value()` for the double-call array/object case — see `forms.md`).

Low-level UI components (`ui-input`, `ui-select`, `ui-date-picker`) stay one level further out: they know `FormField`/`FormValueControl` (see `forms.md`), never a specific business model type like `ApplicationFormModel`. Business knowledge stops at the feature/section component.

## Validation Lives in Schema, Organized by Section

Don't grow the inline function passed to `form()` into hundreds of lines of validators. Once a form has more than one section, give each section its own composable schema and combine them at the root with `schema()` + `apply()`:

```typescript
// personal.schema.ts
export const personalSchema = schema<PersonalFormModel>((path) => {
  required(path.firstName, { message: 'Укажите имя' });
  required(path.lastName, { message: 'Укажите фамилию' });
});

// contacts.schema.ts
export const contactsSchema = schema<ContactsFormModel>((path) => {
  required(path.email, { message: 'Укажите email' });
  email(path.email, { message: 'Некорректный email' });
});

// application.schema.ts
export const applicationSchema = schema<ApplicationFormModel>((path) => {
  apply(path.personal, personalSchema);
  apply(path.contacts, contactsSchema);
});
```

Keep a validation rule as close as possible to the model it constrains: a rule that only concerns `PersonalFormModel` belongs in `personal.schema.ts`, not hoisted to the root schema. Only a rule that genuinely depends on more than one section (e.g. `personal` + `employment` together) belongs at the root level — see `forms.md` for the single-section version of this rule (extract past 5 lines).

## `effect()` Is Not a Form-Rules Substitute

`effect()` is not the mechanism for `required`/`disabled`/`readonly`/`hidden`/conditional-validation/cross-field dependencies — express those declaratively in the schema instead:

```typescript
// ❌ manually toggling validation state from a side effect
effect(() => {
  if (this.model().employed) {
    // ...
  }
});

// ✅ declarative rule in the schema
required(path.employer, { when: ({ valueOf }) => valueOf(path.employed) });
```

Reserve `effect()` for actual side effects that have nothing to do with the form's own validity: analytics, `localStorage`, an external integration, or syncing to something outside the form.

## `computed()` for Derived Values, Not a Second Model

`computed()` is for values that are always fully determined by the model (`fullName`, `total`, `age`, `hasExperience`) — not for building an alternate editable copy of the form's data:

```typescript
// ✅ derived, read-only
readonly fullName = computed(() => `${this.model().firstName} ${this.model().lastName}`);

// ❌ a second editable-looking shape built from the model
readonly formData = computed(() => ({ ...this.model() }));
```

Don't store a value in the model that's always computable from other fields already in it (`fullName` alongside `firstName`/`lastName`) — compute it instead, unless it's independently user-editable or carries its own API-contract semantics distinct from its inputs.

## Initial State

Give the form a named initial-state factory instead of inlining a large object literal in the component:

```typescript
function createInitialApplicationFormModel(): ApplicationFormModel {
  return {
    personal: { firstName: '', lastName: '' },
    contacts: { email: '' },
  };
}
```

For a large form, one factory per section (`createInitialPersonalModel()`, `createInitialContactsModel()`, …) composed into the root factory is preferable to one large inline object.

## Lifecycle: Submit, Autosave, Lazy Rendering

**Submit** belongs to the component that owns the root model — `FormModel → validation → submit → mapFormModelToDto() → API`. Section components don't submit their own slice independently unless the actual business process requires saving that section on its own.

**Autosave**, if the form supports it, observes the model and performs a side effect — it does not change where the form's source of truth lives:

```text
FormModel → autosave mechanism → mapper → API
```

Autosave must not create its own editable copy of the form to watch.

**Lazy-mounted sections** (stepper/tabs/accordion) are a rendering concern only. The model must outlive any individual step component's lifecycle — it lives in the component/service whose lifecycle spans the whole form, not inside a step that gets destroyed on navigation. Don't move data into a lazily-mounted component just because its fields are rendered there.

## Scope: Avoid a Global Service by Default

Don't put a form's model in a `providedIn: 'root'` service purely for convenient access from nested components. Default to passing the form down through inputs (`Page/Feature Component → inputs → Section Components`). A feature-scoped (not root-scoped) service is acceptable when a form genuinely needs coordination across a large number of far-apart components — and even then its lifecycle should match the form's, not the app's.

## File Structure

For a large multi-section form:

```text
application/
├── application.component.ts
├── application.component.html
├── application-form.model.ts
├── application-form.schema.ts
├── application-form.mapper.ts
├── application-form.initial.ts
└── sections/
    ├── personal/
    │   ├── personal.component.ts
    │   ├── personal.model.ts
    │   └── personal.schema.ts
    ├── contacts/
    │   ├── contacts.component.ts
    │   ├── contacts.model.ts
    │   └── contacts.schema.ts
    └── education/
        ├── education.component.ts
        ├── education.model.ts
        └── education.schema.ts
```

This is the shape to grow into as sections accumulate — don't front-load it for a form that's still one section (see `forms.md`'s 5-line threshold for when a single section's model/schema earns its own file at all).

## Decision Checklist Before Implementing a Form

1. Where is the source of truth (the root `signal<FormModel>`)?
2. Does the FormModel need to diverge from the API DTO? If so, where do the mapper functions live?
3. What are the logical sections, and does each map to a component?
4. Which validators are section-local vs. genuinely cross-section?
5. Which values are derived (`computed()`) vs. real editable state?
6. Who owns the form's lifecycle, and who calls submit?
7. Will any part be lazy-mounted (stepper/tabs)?

If the surrounding code doesn't make these answers obvious, read the existing form architecture in the codebase before adding to it rather than guessing.

## Common Mistakes

| Mistake | Fix |
|---|---|
| A second signal (`dto`, `formState`) tracking the same editable data as the model, kept in sync via `effect()` | One `signal<FormModel>`; derive everything else from the `form()` tree or `computed()` |
| Boolean flags (`firstNameTouched`, `isFormDirty`) stored in the FormModel | Read `form.field().touched()`/`.dirty()`/`.invalid()`/`.errors()` from Signal Forms directly |
| API DTO bound directly to the form when its shape differs from the UI's | `mapDtoToFormModel()` / `mapFormModelToDto()` at the load/submit boundary |
| `Partial<FormModel>` as the form's type | Fully-keyed interface with a deliberate empty value (`''`/`null`/`[]`) per field |
| Independent `signal()` + `form()` created per step/tab for one logical business form | One root model, one `form()`; each step/section gets a branch as input |
| A section component creating its own model/`form()` instead of receiving a branch | `[form]="form.sectionName"` passed down from the root owner |
| Hundreds of lines of validators inline in the root `form()` call | Per-section `schema()` composed into the root via `apply()` |
| A cross-field/conditional-validation rule implemented with `effect()` mutating validation state | Express it declaratively in the schema (e.g. `required(..., { when: ... })`) |
| `computed()` used to build a second editable-looking copy of the model | `computed()` only for values fully derived from the model (read-only) |
| A large initial-state object literal inlined in the component | Named `createInitial...Model()` factory (one per section for large forms) |
| Form data moved into a lazily-mounted step component | Keep the model in the component/service whose lifecycle spans the whole form |
| Form's model placed in a `providedIn: 'root'` service "for convenience" | Pass the form down via inputs; use a feature-scoped service only when cross-component coordination genuinely requires it |
| Low-level UI component (`ui-input`, `ui-select`) typed against a specific business FormModel | UI components depend only on `FormField`/`FormValueControl` — business types stay in feature/section components |
| A section component's compound `FieldTree` input (object or array branch) named `field`/`someNameField` | Rename to `form` — reserve `field` for a genuinely scalar leaf `FieldTree` |

Introducing a store/facade/service purely because a form is large is not justified on its own — reach for that added infrastructure only once a specific problem (not just size) requires it.
