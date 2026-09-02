# Shared Rules vs. Local Notes

Two tiers of files can coexist in the same conventions directory:

- **Shared** — plain `*.md`, tracked in git, applies to the whole team.
- **Local** — `*.local.md`, gitignored, personal to one developer. Same idea as a root-level `*.local.md` override file, extended to any subfolder.

**Naming:** a local note with a shared counterpart takes the same path with `.local.md` before the extension (`rules/base/git-and-commits.md` → `rules/base/git-and-commits.local.md`); one with no counterpart uses a topic-based name directly.

**Not auto-loaded by default.** A team-wide auto-load mechanism (e.g. an `@import`-style directive) only takes tracked, shared paths — a gitignored personal file can't be a team-wide auto-load target, since every developer's copy differs. Read a `*.local.md` file explicitly when it's relevant, rather than expecting it preloaded. A root-level `*.local.md` override file is usually the one exception, picked up by filename convention rather than an explicit directive — and it can itself opt certain personal notes into auto-loading for that one developer, without affecting the team-wide config.

**Ambiguous cases:** if it's unclear whether a fact belongs in a shared rule or a personal note, ask before deciding — there's no single fixed signal (beyond an explicit "remember this for the team" vs. "just for me") to tell them apart automatically.

**Subagents don't get local notes.** Don't pass a `*.local.md` file's contents into an implementer/reviewer subagent's prompt as if it were project convention — subagents act on behalf of the whole team/repository. Only include it if the user explicitly asks for that specific note to apply to the current task.

## Common Mistakes

| Mistake | Fix |
|---|---|
| A personal scratch note committed as a plain `*.md` | Rename to `*.local.md` and confirm it's actually gitignored |
