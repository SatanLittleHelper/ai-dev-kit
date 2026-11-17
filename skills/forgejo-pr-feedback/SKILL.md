---
name: forgejo-pr-feedback
description: >-
  Use when the user wants to deal with review comments on their own Forgejo/Gitea pull request —
  «разбери замечания по PR 42», «что мне написали в ревью», «ответь на замечания», "address review comments",
  "triage feedback on my PR". Reads the unanswered comments, gives an assessment of each (valid, todo, invalid,
  question, out of scope), proposes a fix and a reply for every comment, gets the plan approved in Plannotator,
  then applies the approved fixes and posts the replies. Never commits or pushes by itself.
---

# Forgejo PR Feedback

Turns review comments on the user's own PR into an approved plan, then executes it: code fixes in the working tree and replies in the PR. Nothing is changed or posted before the plan is approved in Plannotator.

## Preconditions

Check these once, before the first CLI call. If one fails, tell the user in Russian what is missing and stop.

1. `node --version` is 24 or newer.
2. `FORGEJO_TOKEN` or `GITEA_TOKEN` is set in the terminal environment. Never ask for the token in chat, never print it, never pass it as an argument.
3. The `origin` remote points to a Forgejo/Gitea instance; otherwise ask for `--host`, `--owner`, `--repo` and pass them to every call.

## The CLI

`<base>` is the skill's base directory, shown as «Base directory for this skill» when this skill is loaded. All commands print JSON to stdout:

```bash
node <base>/scripts/cli/main.mts whoami
node <base>/scripts/cli/main.mts pr get <N>
node <base>/scripts/cli/main.mts pr feedback <N>
node <base>/scripts/cli/main.mts pr ci <N>
node <base>/scripts/cli/main.mts pr threads <N>
node <base>/scripts/cli/main.mts pr reply <N> --file <replies.json> [--confirm]
```

`pr reply` without `--confirm` is a dry run: it validates the file and prints the payload, posting nothing.

## 1. Pick the PR and check it is the user's own

1. Take the PR number from the user. No number → ask once.
2. `pr get <N>` and `whoami`. `author` of the PR must equal `login` (case-insensitive). Otherwise answer «PR <N> принадлежит <author>, разбор замечаний — только для своих PR» and stop.
3. The current git branch must equal `headRef` of the PR, because the fixes are applied in this working tree. If it does not, run `git status --short`:
   - Working tree is clean → switch yourself (`git fetch origin <headRef>` first if the branch is not local, then `git checkout <headRef>`). Then check `git branch --show-current` equals `headRef`; if the switch failed, show the git error and go to the blocked case below.
   - Working tree has uncommitted changes (a diff), or the switch is blocked for another reason (the branch is checked out in another worktree, checkout error) → do not switch in place. Ask the user with AskUserQuestion whether to create a git worktree for `headRef` (e.g. `git worktree add ../<repo>-pr-<N> <headRef>`). Created → do all the following steps in the worktree directory. Declined → stop.

## 2. Read the comments

Run `pr ci <N>` too: it prints `{ "state", "failed" }` for the head commit. `state: failure` → tell the user in the answer which checks failed (`failed`), whatever the comments say; this skill does not fix CI, the user decides separately. `pending` → mention that CI is still running.

`pr feedback <N>` returns an array of items. Empty → answer «Замечаний нет» (plus the CI failure, if any) and stop. An item has:

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

## 4. Plan and approval

Write the plan to `tmp/drafts/forgejo-pr-feedback-<N>.md` (absolute path, in Russian). One section per item, in the order of `pr feedback`:

```
## 1 · <path>:<position> — <author>
> <first line of the quote>
**Оценка:** <class> — <reason with the code reference>
**Правка:** <concrete change, or «не требуется»>
**Ответ:** <the reply text that will be posted>
```

Open it for approval with the `plannotator-annotate` skill (tool `plannotator` if available, otherwise `plannotator annotate <absolute path> --gate --json` in the background). Wait for the final decision; an empty output or a polling timeout is not a result.

- `annotated` → apply the annotations to the same file (same path) and open it again. An annotation «Looks good» on an item means: do it as proposed.
- `approved` → go to step 5. Notes attached to an approval are guidance, not a request for another review.
- `dismissed` → stop, change nothing.

## 5. Apply the approved fixes

Make the changes of items with `valid` (and the `todo` items the user asked to do) in the working tree. Do not touch anything outside the approved plan. Show a short summary of the changes. **Do not commit or push**: ask the user separately and follow the project's own rules for commits.

## 6. Post the replies

1. Write `tmp/drafts/forgejo-pr-feedback-<N>-replies.json`: an array of `{ "threadId", "body" }` for `thread` items; for `issue` and `review` items omit `threadId` and add `"quote"` with the first line of the comment. One reply per approved item, text from the plan.
2. Dry run: `pr reply <N> --file <path>`. Show the printed payload to the user in chat and ask for confirmation with AskUserQuestion.
3. Confirmed → run the same command with `--confirm`.
4. Exit code 3 means the post may or may not have gone through: do **not** retry. Run `pr threads <N>`, check which replies are already there and report it to the user.
5. Delete the files in `tmp/drafts/` created by this skill.

## Errors

A non-zero exit code means the CLI printed a Russian message to stderr. Show it as is and stop. Do not switch to `curl`, `gh` or other tools.

| Exit code | Meaning |
|---|---|
| 1 | Request failed (network, HTTP error, no token) |
| 2 | Invalid input or usage — fix the file or the command and run again |
| 3 | Posting status is unknown — see step 6.4 |
