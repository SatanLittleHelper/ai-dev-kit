# Workflow & Misc Code Style

## Avoid `let` with Later Reassignment

Do not declare a `let` and assign it later, including across `try/catch`. Extract the operation into a function and assign its result to a `const`. A `let` is acceptable for a genuinely loop-scoped or incremented value.

## No Magic Numbers

Name non-obvious numeric literals. Express durations, TTLs, intervals, and retry counts as named constants or arithmetic from obvious units (`60 * 60 * 1000`), in production and test code.

## No JSDoc Comments

Do not add JSDoc blocks (`/** ... */`). Use plain one-line comments only where the reason behind the code is not obvious.

## Documentation Language

- Rules and skill instructions are written in English.
- Every markdown artifact produced by `superpowers:brainstorming`, `superpowers:writing-plans`, `writing-prd`, or `roadmap` (design specs, implementation plans, PRDs, roadmaps, and any step-level doc nested under them) is written entirely in Russian — headings, body text, and task descriptions alike, whatever language the user typed their request in. Code blocks, identifiers, file paths, and technical terms inside these docs stay in their original form. The only carve-out is machine-parsed plan markup (`### Task N:` headings, `- [ ]` checkboxes, `Step N` / `Files:` / `Interfaces:` / `Global Constraints` labels), which stays English — see `rules/skills/writing-plans.md` → "Exceptions: keep in English".
- Other reader-facing docs (`README`, `docs/`, other specs/design docs) are also written in Russian.
- Trigger phrases remain in their original input language, with an English duplicate when needed for matching (for example, «давай подумаем» / “let's think about this”).
