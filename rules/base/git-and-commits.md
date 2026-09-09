# Git: Branching & Commits

## Branching

Never commit directly to `main` (or the repository's trunk). Before **every** `git commit`, run `git branch --show-current`. If it is the trunk, stop, propose a task-derived branch name, get the user's confirmation, then create and switch to it. If a commit already landed on the trunk, branch from it and reset the trunk to its remote tracking ref only when it was not pushed.

Release branches use `r<YY>.<Q>.<NN>` (for example `r26.1.01`), release tags append `t`, and hotfix branches use `<release-number>-hf<NNN>`.

## Commits

- Run `git commit` only after an explicit user request; never automatically after a task or plan.
- Before the command, show the one-line message and wait for explicit confirmation, even if the user already asked to commit.
- Use one final commit per feature; implementer subagents never commit.
- Message: past tense, one line, no body, bullets, `Co-Authored-By`, `Claude-Session`, or other attribution trailer.
- Use the same language as the user (default: Russian). A project may override this.
- If the project uses ticket prefixes, read `ticketPrefix` from `.claude/dev-conventions.json` via `rules/orchestrator.md`; never invent one. Format: `[<PREFIX>-NNN] type(scope): Прошедшее время, заглавная буква`. Projects without a tracker omit the prefix.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Automatic commit or one commit per plan task | Wait for the user; make one final commit |
| Commit on trunk | Run the branch check and create a confirmed branch |
| Commit in the same turn as the first message draft | Show it, wait, then run the command |
| Imperative or English-only subject | Use past tense and the user's language |
| Invented ticket number or attribution trailer | Read project config; omit trailers |
