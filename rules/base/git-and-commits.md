# Git: Branching & Commits

## Branching

**Never commit directly to `main`** (or whatever the trunk branch is called) — always create and switch to a feature/fix branch first, even for a one-line fix. If a commit lands on the trunk by mistake, branch off it and reset the trunk back to its remote tracking ref (safe as long as it wasn't pushed).

**Pre-commit branch check — every time, before running `git commit`:** run `git branch --show-current` (or equivalent) and confirm the result isn't `main`/the trunk branch. If it is:
- Don't commit.
- Propose a branch name for the current task (derived from what the work actually is — a ticket id if one exists, otherwise a short slug) and ask the user to confirm it or give a different one.
- Create and switch to that branch (`git checkout -b <name>`) only after the user confirms the name, then proceed to the commit.

This check runs on every commit, not just the first one in a session — a session can drift back onto `main` (a prior branch got merged and deleted, a worktree reset, etc.), so re-verify rather than trusting the branch checked at session start.

**Release branches:** `r<YY>.<Q>.<NN>` (`YY` — last two digits of the year, `Q` — quarter 1–4, `NN` — two-digit index from `01`). Example: `r26.1.01`. **Release tags** (first final commit in a release branch): `<release-number>t` — e.g. `r26.1.01t`. **Hotfix branches:** `<release-number>-hf<NNN>` (`NNN` — two-digit index from `01`) — e.g. `r26.1.01-hf01`.

## Commits

| Concern | Rule |
|---|---|
| When `git commit` runs | Only on explicit user request — never automatically after a task or plan |
| Before every commit | Confirm current branch isn't `main` (see Pre-commit branch check above) |
| Before every commit | Draft the message, show it to the user, wait for explicit confirmation — never commit on the first pass |
| Commits per feature | One, at the end — no intermediate commits per task |
| Commit message | Past tense, one line, no body, no co-author trailer |
| Commit message language | Same language you communicate with the user in (default: Russian), regardless of code/identifier language |

- **Never automatic.** `git commit` runs only on explicit user request — not after a task, not after a whole plan, not as a workflow default. A plan document must not contain commit steps as part of its tasks.
- **Message approval before running the command.** Draft the commit message and show it to the user as plain text before calling `git commit` — never run it in the same step the message is first proposed. This applies even when the user's request was itself "make a commit"/«сделай коммит»: that authorizes committing, not skipping the review of what the message says. Wait for explicit confirmation or an edited version, then commit with that exact text.
- **One commit per feature.** No intermediate commits after individual plan tasks — a single commit at the end bundles the whole feature's changes.
- **Implementer subagents never commit.** Explicitly forbid `git commit` in an implementer subagent's prompt; it leaves changes uncommitted for the orchestrating agent/user to handle.
- **Message shape:** past tense, one line, no body/bullets, no `Co-Authored-By` trailer. State what was done ("Added…", "Fixed…"), not an imperative ("Add…", "Fix…").
- **Language:** the same language you communicate with the user in (this developer's default: Russian) — matches the same default already applied to log messages (see `rules/nestjs/logging.md`). A project's own CLAUDE.md can override this explicitly; absent an override, don't default to English just because the code/identifiers are in English.
- **Ticket-prefixed format, when the project tracks one:** `[<PREFIX>-NNN] type(scope): Прошедшее время, заглавная буква` — e.g. `[SCB-123] feat(bot-gateway): Added...`. The prefix comes from `.claude/dev-conventions.json`'s `ticketPrefix` (see `rules/orchestrator.md`, which reads this file and passes the value along) — never guess or invent a ticket number yourself; if the config is missing and the project clearly uses ticket prefixes, ask the user rather than fabricating one. Release/hotfix branches sometimes use `[branch-name] …` instead of `type(scope)`. Projects with no ticket tracker just skip the prefix.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `git commit` run automatically after finishing a plan task | Only commit when the user explicitly asks |
| Committing without checking the current branch first | `git branch --show-current` before every commit — if it's `main`, stop and get a branch name from/confirmed by the user first |
| Running `git commit` in the same turn the message is first drafted | Show the draft, wait for explicit confirmation or edits, only then commit |
| A multi-task plan gets a commit per task | Squash the workflow into one commit at the very end |
| Commit subject in imperative mood ("Add logging") | Past tense ("Added logging") |
| Inventing a ticket number for the commit prefix | Read it from `.claude/dev-conventions.json` via `rules/orchestrator.md`, or ask — never fabricate |
