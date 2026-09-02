# Git: Branching & Commits

## Branching

**Never commit directly to `main`** (or whatever the trunk branch is called) — always create and switch to a feature/fix branch first, even for a one-line fix. If a commit lands on the trunk by mistake, branch off it and reset the trunk back to its remote tracking ref (safe as long as it wasn't pushed).

**Release branches:** `r<YY>.<Q>.<NN>` (`YY` — last two digits of the year, `Q` — quarter 1–4, `NN` — two-digit index from `01`). Example: `r26.1.01`. **Release tags** (first final commit in a release branch): `<release-number>t` — e.g. `r26.1.01t`. **Hotfix branches:** `<release-number>-hf<NNN>` (`NNN` — two-digit index from `01`) — e.g. `r26.1.01-hf01`.

## Commits

| Concern | Rule |
|---|---|
| When `git commit` runs | Only on explicit user request — never automatically after a task or plan |
| Commits per feature | One, at the end — no intermediate commits per task |
| Commit message | Past tense, one line, no body, no co-author trailer |

- **Never automatic.** `git commit` runs only on explicit user request — not after a task, not after a whole plan, not as a workflow default. A plan document must not contain commit steps as part of its tasks.
- **One commit per feature.** No intermediate commits after individual plan tasks — a single commit at the end bundles the whole feature's changes.
- **Implementer subagents never commit.** Explicitly forbid `git commit` in an implementer subagent's prompt; it leaves changes uncommitted for the orchestrating agent/user to handle.
- **Message shape:** past tense, one line, no body/bullets, no `Co-Authored-By` trailer. State what was done ("Added…", "Fixed…"), not an imperative ("Add…", "Fix…").
- **Ticket-prefixed format, when the project tracks one:** `[<PREFIX>-NNN] type(scope): Прошедшее время, заглавная буква` — e.g. `[SCB-123] feat(bot-gateway): Added...`. The prefix comes from `.claude/dev-conventions.json`'s `ticketPrefix` (see `rules/orchestrator.md`, which reads this file and passes the value along) — never guess or invent a ticket number yourself; if the config is missing and the project clearly uses ticket prefixes, ask the user rather than fabricating one. Release/hotfix branches sometimes use `[branch-name] …` instead of `type(scope)`. Projects with no ticket tracker just skip the prefix.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `git commit` run automatically after finishing a plan task | Only commit when the user explicitly asks |
| A multi-task plan gets a commit per task | Squash the workflow into one commit at the very end |
| Commit subject in imperative mood ("Add logging") | Past tense ("Added logging") |
| Inventing a ticket number for the commit prefix | Read it from `.claude/dev-conventions.json` via `rules/orchestrator.md`, or ask — never fabricate |
