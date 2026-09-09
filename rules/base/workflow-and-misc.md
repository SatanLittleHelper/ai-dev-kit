# Workflow & Misc Code Style

## Avoid `let` with Later Reassignment

Do not declare a `let` and assign it later, including across `try/catch`. Extract the operation into a function and assign its result to a `const`. A `let` is acceptable for a genuinely loop-scoped or incremented value.

## No Magic Numbers

Name non-obvious numeric literals. Express durations, TTLs, intervals, and retry counts as named constants or arithmetic from obvious units (`60 * 60 * 1000`), in production and test code.

## Documentation Language

- Rules and skill instructions are written in English.
- Reader-facing docs (`README`, `docs/`, PRDs, specs, design docs, roadmaps) are written in Russian.
- Trigger phrases remain in their original input language, with an English duplicate when needed for matching (for example, «давай подумаем» / “let's think about this”).
