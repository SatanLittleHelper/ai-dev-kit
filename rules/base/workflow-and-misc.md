# Workflow & Misc Code Style

## Avoid `let` with Later Reassignment

Prefer a `const` assigned from an arrow function that returns the result, instead of `let x; try { x = ...; } catch { ... }`:

```typescript
// ❌ mutable let, reassigned inside try/catch
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  throw new Error('invalid JSON');
}

// ✅ const from a function that owns the try/catch
const parseJsonConfig = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid JSON');
  }
};
const parsed = parseJsonConfig(raw);
```

## No Magic Numbers

Express durations, TTLs, intervals, and retry counts as named constants or arithmetic from obvious base units (`60 * 60 * 1000`, or a shared `const`) — never an opaque literal like `900000`. Applies in both production and test code — a test's own timeout/delay values need names just as much as production ones.

## Documentation Language

Two tiers, split by audience:

- **Rules** — internal convention/rule files (anything under a `rules`-style conventions folder, a skill's own `SKILL.md`, or a workflow-overrides section of a root instructions file) — write in English, independent of whatever language you actually speak with the user. These are instructions consumed by the agent, not by a human reader.
- **Docs** — reader-facing documentation (README, `docs/`-style project documentation, PRDs, specs, design docs, roadmaps) — write in Russian. These are meant for the (Russian-speaking) human to read.

**Exception — trigger phrases:** when a rule defines a phrase that must be recognized in the user's actual input (a skill-activation trigger, a remember-this keyword), keep that phrase in the language it was originally given in and add an English duplicate alongside it — never translate away the literal phrase, since that breaks matching against real user input. Example: «давай подумаем» / "let's think about this", not just the English translation.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `let x; try { x = ...} catch {...}` | Extract to a function returning the value, assign a `const` from its call |
| A literal `86400000` for a TTL | Name it, or write `24 * 60 * 60 * 1000` |
| A trigger phrase translated into English inside a rule file | Keep the original-language phrase, add the English duplicate alongside it |
| Reader-facing docs (README, PRD, spec) written in English | Rules stay English, but docs are for the human reader — write them in Russian |
