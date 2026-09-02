# Component File Structure & Styling

- Split component files: `*.component.ts` + `*.component.html` mandatory — never inline `template`/`styles` in the decorator.
- `*.component.scss` only when there's real CSS the utility framework can't express (a custom animation, etc.) — never create an empty SCSS file "just in case."
- Styles are exclusively utility classes (Tailwind or equivalent) in the template — font sizes, spacing, colors only through utility classes, no hardcoded pixel values in component styles.
- **Block-level components set `host: { class: 'block' }`:** any standalone component meant to occupy its own layout block (not an inline control) sets this in `@Component`, so it renders `display: block` by default — don't rely on every consumer remembering to add a `block` utility class themselves; consumers should only pass spacing/margin classes.
- **Programmatic scroll — `ViewportScroller`, not raw `window.scrollTo`:** when a component/service needs to scroll the page programmatically, inject `ViewportScroller` from `@angular/common` and call `scrollToPosition([x, y])` — Angular's own DOM abstraction, consistent with `inject()`-only DI (`rules/angular/di.md`).
- **Component built but not yet wired into the app** (no route, no parent template references it): don't skip visual verification silently. Propose a demo page instead of just running build/lint/tests — a **public route**, reachable without auth, so it can be opened standalone during development. This is a suggestion to make to the user, not an automatic action; remove the demo route once the component is wired into its real place.
- **Date formatting in templates — through a pipe, never inline `dayjs(...).format(...)` in the component class.** A formatting pipe that accepts either a UTC timestamp (converted to local) or an already-local calendar value, plus an optional format-string argument, keeps date formatting out of component logic and reusable across templates; the format string itself belongs in the consuming component's own constants file, not a template literal.

## Taiga UI Library Notes (when the project uses Taiga UI)

- **`tuiLabel` auto-shrinks its font unless it wraps a control:** Taiga's `TuiLabel` directive switches between a larger and smaller typography token depending on whether the label wraps a data-list-host-like descendant (`tui-textfield`, `tui-select`, etc.) — an ordinary field label ends up smaller, a bare text label above something else (e.g. a file input) stays larger. Don't patch this per-component; fix it once globally in your cross-cutting Taiga override stylesheet with a selector specific enough to win without `!important` (element + attribute beats Taiga's own `:where()`-scoped rule): `label[tuiLabel] { font: var(--tui-typography-body-m); }`.
- **Tailwind color tokens scoped to `bg-*` only:** when mapping a Taiga CSS variable into a Tailwind class and the token is only ever meant as a background, add it under `theme.extend.backgroundColor`, not the general `theme.extend.colors` palette — putting it in `colors` makes it usable (and misusable) as `text-*`/`border-*` too.

## Layout Spacing

- **Margin, not padding, between siblings:** `mt-*` on the element *after* the gap, never `pt-*` on a wrapper just to create separation from a preceding sibling — padding is space inside a box, margin is space between boxes. `mt-auto` for "stick to the bottom" only works when the element is a direct flex/grid item of a flex/grid container — it's a silent no-op otherwise.
- **`grid` + `gap-*` for a fixed vertical stack inside one component:** when a component's own template stacks a fixed sequence of child blocks with even spacing, put `grid gap-*` on the stacking container instead of `flex flex-col` with a repeated `mt-*` on every child after the first — the spacing is stated once, on the container, instead of duplicated per child. This is specifically for the *outer vertical stack of one component's own children* — horizontal inline rows (icon + label) stay `flex items-center gap-*`, and spacing *between separate composed components* on a page stays margin (there's no shared container to own a `gap`).

## Common Mistakes

| Mistake | Fix |
|---|---|
| `padding-top` on a wrapper to separate it from the element above | `margin-top` on the element itself |
| Repeated `mt-*` on every child of a fixed vertical stack | `grid gap-*` on the container |
