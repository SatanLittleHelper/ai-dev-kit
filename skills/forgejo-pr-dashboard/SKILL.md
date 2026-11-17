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

`<base>` is the skill's base directory, shown as «Base directory for this skill» when this skill is loaded. Run:

```bash
node <base>/scripts/cli/main.mts pr dashboard
```

Output is JSON on stdout:

```json
{ "due": [Row], "waiting": [Row], "truncated": false }
```

A `Row` has `number`, `title`, `author`, `isOwn`, `headRef`, `scenario`, `status`, `conflicted`, `ci` (`success` | `failure` | `pending` | `none`), `failedChecks` (names of the failed CI checks), `url` (link to the PR), `activity` (age of the last activity: «5 мин», «3 ч», «2 дн», or empty). The CLI already sorts the rows: PRs that need the user's action first, own PRs above others, then by number.

## Output

Answer in Russian. One markdown table per group, one row per PR, in the order of the CLI:

```
Требует вашего действия (3)

| PR | Статус | CI | Автор | Заголовок | Активность |
|---|---|---|---|---|---|
| [#297](https://forgejo.example/o/r/pulls/297) | 🔴 упал CI (мой) | ❌ | вы | Пересоздал страницу | 2 ч |
| [#295](https://forgejo.example/o/r/pulls/295) | 💬 есть замечания (мой) | ✅ | вы | Исправил импорт | 1 дн |
| [#290](https://forgejo.example/o/r/pulls/290) | 👀 на проверке | ⏳ | bob | Экспорт | 5 мин |

Упавшие проверки: #297 — [CI] build and test / check (pull_request)

Ждёт других (1)

| PR | Статус | CI | Автор | Заголовок | Активность |
|---|---|---|---|---|---|
| [#288](https://forgejo.example/o/r/pulls/288) | ⏳ ждём автора | ✅ | alice | Рефакторинг | 3 дн |
```

- The PR cell is a link: `[#<number>](<url>)`.
- Status cell: icon + `status` exactly as given + ` (мой)` when `isOwn` + ` · конфликт` when `conflicted`. Icons: `упал CI` 🔴, `есть замечания` 💬, `конфликт` ⚠️, `на проверке` 👀, `перепроверка` 🔁, `готов к слиянию` ✅, `ждём автора` ⏳, `ждём ревью` ⏳, `влит` 🟣, `закрыт` ⚫.
- CI cell by `ci`: `success` ✅, `failure` ❌, `pending` ⏳, `none` —.
- Author cell: `вы` when `isOwn`, otherwise `author`. Activity cell: `activity` as given; empty → —.
- Under a table, if some of its rows have `ci: failure` and non-empty `failedChecks`, one line «Упавшие проверки: #<number> — <failedChecks через запятую>»; several PRs go in one line separated by «; ». No such rows → no line.
- Group headings come from `due` («Требует вашего действия») and `waiting` («Ждёт других») with the row count in brackets. Omit an empty group. Both empty → «Открытых PR нет.»
- `truncated: true` → add «Прочитано 50 открытых PR — это предел одного запроса; остальные смотрите по номеру».
- Do not add recommendations or next steps the user did not ask for. To work on review comments of an own PR, the user invokes the `forgejo-pr-feedback` skill.

## Errors

A non-zero exit code means the CLI printed a Russian message to stderr. Show it as is and stop. Do not retry, do not switch to `curl`, `gh` or any other tool.

| Exit code | Meaning |
|---|---|
| 1 | Request failed (network, HTTP error, no token) |
| 2 | Wrong usage — check the command against this file |
