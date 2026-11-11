# Workflow & Misc Code Style

## Avoid `let` with Later Reassignment

Do not declare a `let` and assign it later, including across `try/catch`. Extract the operation into a function and assign its result to a `const`. A `let` is acceptable for a genuinely loop-scoped or incremented value.

## Constants: Name Only What Needs a Name

Production code only: test code may use magic numbers and short literals freely.

- **No name needed:** self-evident literals (`slice(0, 3)`, `?? 0`, `i + 1`, `'utf-8'`, `100`) and a short string used once whose meaning is clear in place (a short error text in a one-off `throw`, a CSS class, an object key).
- **Name needed:** a numeric literal whose meaning is not obvious (durations, TTLs, intervals, retry counts, limits). Arithmetic from obvious units (`60 * 60 * 1000`) is fine, but give it a name too: `const TTL_MS = 60 * 60 * 1000`.
- **Raw SQL is always a named constant.** Used by one repository — a local `const` at the top of that repository file. Used by several files, or so many queries that the repository stops being readable — `*.constants.ts`.
- **The name is local until there is a second consumer.** A constant lives as a `const` at the top of the file that uses it. Move it to `*.constants.ts` only when a second file needs it (`rules/base/file-structure.md`). Do not create a constants file for a single use.
- **Error texts:** with custom error classes, the message lives inside the class or its factory (`*.errors.ts`, see `rules/base/file-structure.md`). Do not create a file that holds only message strings.

## No JSDoc Comments

Do not add JSDoc blocks (`/** ... */`). Use plain one-line comments only where the reason behind the code is not obvious.

## Documentation Language

- Rules and skill instructions are written in English.
- Every markdown artifact produced by `superpowers:brainstorming`, `superpowers:writing-plans`, or `roadmap` (design specs, implementation plans, roadmaps, and any step-level doc nested under them) is written entirely in Russian — headings, body text, and task descriptions alike, whatever language the user typed their request in. Code blocks, identifiers, file paths, and technical terms inside these docs stay in their original form. The only carve-out is machine-parsed plan markup (`### Task N:` headings, `- [ ]` checkboxes, `Step N` / `Files:` / `Interfaces:` / `Global Constraints` labels), which stays English — see `rules/skills/writing-plans.md` → "Exceptions: keep in English".
- Other reader-facing docs (`README`, `docs/`, other specs/design docs) are also written in Russian.
- Trigger phrases remain in their original input language, with an English duplicate when needed for matching (for example, «давай подумаем» / “let's think about this”).
