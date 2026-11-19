---
name: forgejo-pr-feedback
description: >-
  Use when the user wants to deal with review comments on their own Forgejo/Gitea pull request, or to look at
  someone else's PR by number (read-only overview) —
  «разбери замечания по PR 42», «что мне написали в ревью», «ответь на замечания», "address review comments",
  "triage feedback on my PR"; also a bare PR number («297», «#297») right after the `forgejo-pr-dashboard` table;
  also «разбери CI», «почему упал CI на PR», "fix failed checks". Reads the unanswered
  comments and the failed CI checks, gives an assessment of each (valid, todo, invalid, question, out of scope),
  proposes a fix (and a reply for every comment) and, when the PR has merge conflicts, merging the base branch into
  the PR branch and resolving them, gets the plan approved in Plannotator, then applies the approved
  fixes and posts the replies. For someone else's PR only shows an overview (description, status, CI, files, reviews,
  discussion) and changes nothing. By the state of the PR it offers to merge a ready PR, opens the review page of someone else's PR waiting for review, or goes through the comments of the user's own PR. Never commits or pushes by itself.
---

# Forgejo PR Feedback

Turns review comments and CI failures on the user's own PR into an approved plan, then executes it: code fixes in the working tree and replies in the PR (CI failures get fixes only, no replies). Nothing is changed or posted before the plan is approved in Plannotator.

For someone else's PR there is nothing to fix or reply to: the skill only shows an overview of it (see «Overview») and changes nothing.

## Preconditions

Check these once, before the first CLI call. If one fails, tell the user in Russian what is missing and stop.

1. `node --version` is 24 or newer.
2. `FORGEJO_TOKEN` or `GITEA_TOKEN` is set in the terminal environment. Never ask for the token in chat, never print it, never pass it as an argument.
3. The `origin` remote points to a Forgejo/Gitea instance; otherwise ask for `--host`, `--owner`, `--repo` and pass them to every call.

## The CLI

`<base>` is the skill's base directory, shown as «Base directory for this skill» when this skill is loaded. All commands print JSON to stdout:

```bash
node <base>/scripts/cli/main.mts whoami
node <base>/scripts/cli/main.mts pr route <N>
node <base>/scripts/cli/main.mts pr merge <N> [--method merge|squash|rebase] [--confirm]
node <base>/scripts/cli/main.mts pr get <N>
node <base>/scripts/cli/main.mts pr feedback <N>
node <base>/scripts/cli/main.mts pr ci <N>
node <base>/scripts/cli/main.mts pr files <N>
node <base>/scripts/cli/main.mts pr reviews <N>
node <base>/scripts/cli/main.mts pr threads <N>
node <base>/scripts/cli/main.mts pr reply <N> --file <replies.json> [--confirm]
```

`pr reply` without `--confirm` is a dry run: it validates the file and prints the payload, posting nothing.

`pr merge` without `--confirm` is a dry run: it checks that the PR can be merged now and prints what would happen.

## 1. Pick the PR and route it

1. Take the PR number from the user. No number → ask once.
2. `pr route <N>` prints `{ number, url, isOwn, scenario, status, ci, baseRef, stackParent, action }`. Branch by `action` and do not decide by yourself:

| `action` | What to do |
|---|---|
| `merge` | Ask with AskUserQuestion «Влить #<N> в `<baseRef>`?»; when `ci` is `pending`, say in the question that CI is still running. Yes → `pr merge <N> --confirm` and report the result; any other answer → stop. Never merge without the explicit yes. Exit code 3: do not retry, run `pr get <N>` and report the state. |
| `merge-blocked` | Tell that the PR is stacked on #`<stackParent>` and that one has to be merged first. Stop. |
| `open-review` | Open `<url>/files` in the browser (`open "<url>/files"` on macOS, otherwise print the link), say in one line what was opened. Stop. |
| `triage` | Own PR with comments, CI failure or conflict: continue with step 3 below and the steps 3–6 of this skill. |
| `overview` | Go to «Overview» below and stop there; steps 3–6 apply to `triage` only. |

3. (`triage` only) Run `pr get <N>`. The current git branch must equal `headRef` of the PR, because the fixes are applied in this working tree. If it does not, run `git status --short`:
   - Working tree is clean → switch yourself (`git fetch origin <headRef>` first if the branch is not local, then `git checkout <headRef>`). Then check `git branch --show-current` equals `headRef`; if the switch failed, show the git error and go to the blocked case below.
   - Working tree has uncommitted changes (a diff), or the switch is blocked for another reason (the branch is checked out in another worktree, checkout error) → do not switch in place. Ask the user with AskUserQuestion whether to create a git worktree for `headRef` (e.g. `git worktree add ../<repo>-pr-<N> <headRef>`). Created → do all the following steps in the worktree directory. Declined → stop.

## 2. Read the comments

`pr get <N>` already told whether the PR has conflicts (`conflicted: true`). If it does, the plan gets one more item, «Конфликт» (see step 3 and step 5), even when there are no comments.

Run `pr ci <N>` too: it prints `{ "state", "failed" }` for the head commit, `failed` is the list of failed check names. `state: failure` → each failed check becomes a CI item of the plan (see step 3). `pending` → mention that CI is still running. `success` / `none` → no CI items.

`pr feedback <N>` returns an array of items. Empty, no failed checks and no conflict → answer «Замечаний нет» and stop. Empty but CI failed or the PR is conflicted → continue with those items only. An item has:

| Field | Meaning |
|---|---|
| `id` | stable id of the item |
| `kind` | `thread` (inline), `issue` (general comment), `review` (body of a review) |
| `threadId` | id to reply in the same thread; `null` for `issue` and `review` |
| `path`, `position` | place in the code; `null` for `issue` and `review` |
| `author`, `quote` | who wrote it; the quote contains the whole conversation of the thread |
| `stale` | the comment was left on an older commit than the current head: the code may have changed since |
| `disagree` | the user already answered in this thread before and the reviewer replied again |

## 3. Assess every item

For `thread` items read the code at `path` in the working tree (the branch is the PR head). Give each item exactly one class:

| Class | Meaning | Reply |
|---|---|---|
| `valid` | the reviewer is right, we fix it | «Исправлено» + what was done |
| `todo` | right, but not blocking: goes to the backlog | «Вынесено в TODO» + why it is not blocking |
| `invalid` | the reviewer is wrong or it is already so | polite reasoning with a code reference |
| `question` | the comment asks something | the answer, or the clarifying question |
| `out-of-scope` | not related to this PR | why it is out of scope |

Rules:

- `stale: true` → first check whether the code at the place already changed as asked. Already fixed → class `valid` marked `fixed` (nothing to change, reply says where).
- `disagree: true` → read the whole `quote`; do not repeat the previous argument, answer the new point.
- Do not invent facts about the code: every assessment cites what you read (file and what is there).
- A proposed fix is concrete: the exact change (a short diff or the new code), not «fix it».

### CI items

The CLI gives only the names of failed checks, not their logs. Find out the cause yourself, do not guess:

1. Find what the check runs: the CI config in the repo (`.forgejo/workflows/`, `.gitea/workflows/`, `.github/workflows/` and similar) → the command of the failed job.
2. Run that command locally in the working tree (lint, tests, build; only if it is safe and has no side effects — no deploy, no publish). Read the real output. A command that cannot be run locally (needs secrets, special runner) → say so, and base the assessment only on what you can verify in the code; ask the user for the log if it is not enough.
3. Give the item one class:

| Class | Meaning | Action |
|---|---|---|
| `valid` | the failure is caused by this PR | a concrete fix |
| `flaky` | passes locally, looks like an infra/timing failure | «перезапустить CI», no code change |
| `out-of-scope` | fails the same way without this PR's changes (e.g. on the base branch) | why, no code change in this PR |

A CI item has no reply to post.

### Conflict item

`conflicted: true` → propose merging the base branch into the PR branch and resolving the conflicts (a merge, not a rebase: no history rewrite, no force push). Do not run anything yet; only prepare the proposal:

1. `git fetch origin <baseRef>`.
2. Find which files will conflict without touching the working tree: `git merge-tree --write-tree --name-only HEAD origin/<baseRef>` (exit code 1 lists the conflicted files). Read each file's conflicting hunks and say, per file, how you would resolve it (keep ours, keep theirs, or the combined code). Do not guess intent: when both sides changed the same logic, say that and ask the user in the plan.
3. The item has no reply to post. It is mandatory when `conflicted` is true; never skip it silently.

## 4. Plan and approval

Write the plan to `tmp/drafts/forgejo-pr-feedback-<N>.md` (absolute path, in Russian). One section per item, in the order of `pr feedback`:

```
## 1 · <path>:<position> — <author>
> <first line of the quote>
**Оценка:** <class> — <reason with the code reference>
**Правка:** <concrete change, or «не требуется»>
**Ответ:** <the reply text that will be posted>
```

The conflict item goes first, before the comments (the merge changes the code the comments refer to):

```
## Конфликт · <headRef> ← <baseRef>
**Файлы:** <conflicted files>
**Предложение:** влить `origin/<baseRef>` в `<headRef>` и решить конфликты
**Решение:** <per file: what to keep and why>
```

CI items go after the comments, one section each, without a reply:

```
## CI · <check name>
**Причина:** <what the output says, with the command that was run>
**Оценка:** <class> — <reason>
**Правка:** <concrete change, or «не требуется»>
```

Open it for approval with the `plannotator-annotate` skill (tool `plannotator` if available, otherwise `plannotator annotate <absolute path> --gate --json` in the background). Wait for the final decision; an empty output or a polling timeout is not a result.

- `annotated` → apply the annotations to the same file (same path) and open it again. An annotation «Looks good» on an item means: do it as proposed.
- `approved` → go to step 5. Notes attached to an approval are guidance, not a request for another review.
- `dismissed` → stop, change nothing.

## 5. Apply the approved fixes

If the conflict item is approved, do it first. Before merging check that `git branch --show-current` equals `headRef` (in the worktree if one was created in step 1.3); if not, repeat the switch from step 1.3 and never merge into another branch. Then `git merge --no-commit --no-ff origin/<baseRef>`, resolve the conflicted files as approved, `git add` them, check that no markers are left (`git diff --check`, grep for `<<<<<<<`). Leave the merge uncommitted (`MERGE_HEAD` stays); the user commits it. Then apply the other items on top of the merged code. Resolution that differs from the plan, or a file the plan did not list → stop and ask.

Make the changes of items with `valid` (comments and CI items; and the `todo` items the user asked to do) in the working tree. Do not touch anything outside the approved plan. Show a short summary of the changes. **Do not commit or push** (this includes the merge commit): ask the user separately and follow the project's own rules for commits.

## 6. Post the replies

1. Write `tmp/drafts/forgejo-pr-feedback-<N>-replies.json`: an array of `{ "threadId", "body" }` for `thread` items; for `issue` and `review` items omit `threadId` and add `"quote"` with the first line of the comment. One reply per approved item, text from the plan.
2. Dry run: `pr reply <N> --file <path>`. Show the printed payload to the user in chat and ask for confirmation with AskUserQuestion.
3. Confirmed → run the same command with `--confirm`.
4. Exit code 3 means the post may or may not have gone through: do **not** retry. Run `pr threads <N>`, check which replies are already there and report it to the user.
5. Delete the files in `tmp/drafts/` created by this skill.

## Overview

Read-only; used for the `overview` action (any PR that has nothing to merge, review or fix right now). Run `pr ci <N>`, `pr files <N>`, `pr reviews <N>`, `pr threads <N>` (the `pr get` result is already there). Answer in Russian, skipping empty sections:

1. Header: `[#<N> <title>](<url>)` · `<author>` · `<headRef> → <baseRef>`.
2. State: `открыт` / `влит` (`merged`) / `закрыт`; ` · конфликт` when `conflicted`; CI ✅ `success`, ❌ `failure` (+ names from `failed`), ⏳ `pending`, — `none`.
3. Description: `body` as given; empty → «Описания нет».
4. Files: count and the list (over 20 → first 20 and «и ещё N»).
5. Reviews: `<author> — <approved ✅ | changes 🔴 | comment 💬 | pending ⏳>` and a short quote of `body`; skip dismissed.
6. Discussion: unresolved threads (`<path>:<line> — <author>: <first line of the last comment>`), the number of resolved ones, then general comments.

No plan, no Plannotator, no fixes, no replies, no recommendations.

## Errors

A non-zero exit code means the CLI printed a Russian message to stderr. Show it as is and stop. Do not switch to `curl`, `gh` or other tools.

| Exit code | Meaning |
|---|---|
| 1 | Request failed (network, HTTP error, no token) |
| 2 | Invalid input or usage — fix the file or the command and run again |
| 3 | Posting status is unknown — see step 6.4 |
