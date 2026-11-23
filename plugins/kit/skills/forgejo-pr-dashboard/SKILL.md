---
name: forgejo-pr-dashboard
description: >-
  Use when the user asks which pull requests of the current project are open and what each one waits for —
  «покажи PR», «какие PR открыты», «что ждёт моего ревью», «статусы PR», «что ждёт автора», "list open PRs",
  "what is waiting for my review". Read-only dashboard for Forgejo/Gitea: every open PR with a status relative
  to the user (needs my review, needs re-review, review comments on my PR, conflict, failed CI, waiting for the author,
  ready to merge). Does not change anything.
---

# Forgejo PR Dashboard

Shows every open pull request of the current repository with a status relative to the user. Read-only: no reviews, comments, commits or pushes.

## Preconditions

Check these once, before the first CLI call. If one fails, tell the user in Russian what is missing and stop — no workarounds, no other tools.

1. `node --version` is 24 or newer. Older Node cannot run the bundled TypeScript CLI.
2. `FORGEJO_TOKEN` or `GITEA_TOKEN` is set in the terminal environment. Never ask for the token in chat, never print it, never pass it as an argument.
3. The repository's `origin` remote points to a Forgejo/Gitea instance. If it does not, ask the user for `--host`, `--owner`, `--repo` and pass them to every call.

## The CLI

`<base>` is the skill's base directory, shown as «Base directory for this skill» when this skill is loaded. The CLI lives in the same plugin (`<base>/../../tools/forgejo`), there is no copy in the skill. Run:

```bash
node <base>/../../tools/forgejo/cli/main.mts pr dashboard
```

The CLI builds the whole dashboard itself and prints it on stdout as ready markdown: groups «Требует вашего действия» / «Ждёт других» with the row counts, one table per group, the «Упавшие проверки» line, the «Открытых PR нет.» message and the truncation note. The order of rows (a stack stays together as a chain from the root to its children; actions first, then ready to merge, then own PRs, then by number), the statuses, icons and columns are fixed in the CLI code, not in this file.

## Output

1. Run the command above.
2. Show stdout to the user **verbatim**: do not rewrite, reorder, translate, shorten or reformat tables, do not add or drop columns, rows, icons or lines, do not add a summary, recommendations or next steps the user did not ask for. The text is already in Russian and already markdown.
3. To work on review comments of an own PR, the user invokes the `kit:forgejo-pr-feedback` skill.

`pr dashboard --format json` prints the raw data (`{ due, waiting, truncated }`) for debugging only; never use it to build the answer.

## Follow-up: PR number

If the user answers the dashboard with a PR number («297», «#297», «покажи 297»), invoke the `kit:forgejo-pr-feedback` skill for that PR (pass the number) — do not answer from the dashboard rows and do not call the CLI yourself.

## Errors

A non-zero exit code means the CLI printed a Russian message to stderr. Show it as is and stop. Do not retry, do not switch to `curl`, `gh` or any other tool.

| Exit code | Meaning |
|---|---|
| 1 | Request failed (network, HTTP error, no token) |
| 2 | Wrong usage — check the command against this file |
