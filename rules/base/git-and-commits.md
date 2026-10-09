# Git: Branching & Commits

## Branching

Never commit directly to `main` (or the repository's trunk). Before **every** `git commit`, run `git branch --show-current`. If it is the trunk, stop, propose a task-derived branch name, get the user's confirmation, then create and switch to it. If a commit already landed on the trunk, branch from it and reset the trunk to its remote tracking ref only when it was not pushed.

If the task number is already known, the branch name is exactly that number (`<PREFIX>-NNN`, with `ticketPrefix` from `.claude/dev-conventions.json` via `rules/orchestrator.md`) and nothing else: no type prefix, slug, description, or username. Use a descriptive task-derived name only when no task number exists yet. Never invent the number.

Release branches use `r<YY>.<Q>.<NN>` (for example `r26.1.01`), release tags append `t`, and hotfix branches use `<release-number>-hf<NNN>`.

## Commits

- Run `git commit` only after an explicit user request; never automatically after a task or plan.
- Before committing, check that the current branch name matches the task number when it is known (e.g. from the user, the plan, or the commit's ticket prefix): it must be only `<PREFIX>-NNN`. If the branch has extra parts (slug, type prefix) or a different number, stop, tell the user, and propose renaming (`git branch -m`) — do not commit until they confirm. Release and hotfix branches are exempt.
- Show the user the exact one-line message once, even if they already asked to commit, and never ask for confirmation twice. Put the final message into the `git commit` command itself: the tool's permission prompt is the confirmation, so do not ask a separate chat question first. If no message was proposed yet, show it in the same reply that runs the command.
- Use one final commit per feature; implementer subagents never commit.
- Do not commit single spec/design documents (`docs/superpowers/specs/` and similar). Roadmap documents under `docs/<feature-slug>/` (roadmap, PRDs, designs, step plans, state files) are permanent git history: when a commit is requested, include them or ask which files to include; never exclude them silently.
- Message: past tense, one line, no body, bullets, `Co-Authored-By`, `Claude-Session`, or other attribution trailer.
- Use the same language as the user (default: Russian). A project may override this.
- If the project uses ticket prefixes, read `ticketPrefix` from `.claude/dev-conventions.json` via `rules/orchestrator.md`; never invent one. Format: `[<PREFIX>-NNN] type(scope): Прошедшее время, заглавная буква`. Projects without a tracker omit the prefix.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Automatic commit or one commit per plan task | Wait for the user; make one final commit |
| Branch name with a slug or type prefix when the task number is known (`feat/PROJ-123-login`) | Name it exactly `PROJ-123`; at commit time, flag and propose renaming |
| Commit on trunk | Run the branch check and create a confirmed branch |
| A separate chat question to confirm the message, followed by the tool's own prompt | Run `git commit` with the final message; the tool prompt is the single confirmation |
| Excluding roadmap documents from a commit without saying so | Include `docs/<feature-slug>/` files or ask which files to include |
| Imperative or English-only subject | Use past tense and the user's language |
| Invented ticket number or attribution trailer | Read project config; omit trailers |
