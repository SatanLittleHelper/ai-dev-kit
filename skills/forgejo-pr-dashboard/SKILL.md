---
name: forgejo-pr-dashboard
description: >-
  Use when the user asks which pull requests of the current project are open and what each one waits for —
  «покажи PR», «какие PR открыты», «что ждёт моего ревью», «статусы PR», «что ждёт автора», "list open PRs",
  "what is waiting for my review". Read-only dashboard for Forgejo/Gitea: every open PR with a status relative
  to the user (needs my review, needs re-review, review comments on my PR, conflict, waiting for the author,
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

`<base>` is the skill's base directory, shown as «Base directory for this skill» when this skill is loaded. Run:

```bash
node <base>/scripts/cli/main.mts pr dashboard
```

Output is JSON on stdout:

```json
{ "due": [Row], "waiting": [Row], "truncated": false }
```

A `Row` has `number`, `title`, `author`, `isOwn`, `headRef`, `scenario`, `status`, `conflicted`. The CLI already sorts the rows: PRs that need the user's action first, own PRs above others, then by number.

## Output

Answer in Russian, two groups, one line per PR:

```
Требует вашего действия:
#42 на проверке · bob — Добавить экспорт
#45 есть замечания (мой) · вы — Исправить импорт

Ждёт других:
#40 ждём автора · alice — Рефакторинг
```

- Line format: `#<number> <status>` + ` (мой)` when `isOwn` + ` · конфликт` when `conflicted` + ` · <author> — <title>`. Use `status` exactly as given.
- Group headings come from `due` and `waiting`. Omit an empty group. Both empty → «Открытых PR нет.»
- `truncated: true` → add «Прочитано 50 открытых PR — это предел одного запроса; остальные смотрите по номеру».
- Do not add recommendations or next steps the user did not ask for. To work on review comments of an own PR, the user invokes the `forgejo-pr-feedback` skill.

## Errors

A non-zero exit code means the CLI printed a Russian message to stderr. Show it as is and stop. Do not retry, do not switch to `curl`, `gh` or any other tool.

| Exit code | Meaning |
|---|---|
| 1 | Request failed (network, HTTP error, no token) |
| 2 | Wrong usage — check the command against this file |
