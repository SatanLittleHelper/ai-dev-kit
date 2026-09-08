---
name: splitting-pr
description: >-
  Use when a large uncommitted diff has piled up on a branch and needs to be split into a chain
  of small, safe, sequential PRs — explicit triggers include "разбей PR", "слишком большой PR",
  "раздели изменения на несколько PR", "split this PR", "too many files in one PR". Retroactive
  only: it acts on a diff that already exists, never on work not yet started. Splits the diff
  into stacked branches/PRs, each capped at 15 business-logic files (assets/docs excluded from
  the cap) unless breaking the cap is the only way to keep coupled files together. Does not run
  its own build/lint/test — that's left to the project's own pre-push hook. Tracks progress in a
  JSON state file (deleted automatically once the split completes) so the split survives session
  restarts and no file from the original diff is ever silently dropped.
---

# Splitting PR

## Overview

A large uncommitted diff on one branch produces one large, risky-to-review PR. This skill turns
it into a **stacked chain of small PRs**: each one small enough to review (≤15 business-logic
files, assets/docs excluded), each one tracked in a state file so the split can be paused and
resumed across sessions without losing track of which files went where. This skill does not run
its own build/lint/test step — verification is whatever the project's own pre-push hook already
does at `git push` time (Step 6 of `references/block-cycle.md`); if that hook rejects a push,
that's the signal a block was cut wrong, not something this skill checks proactively beforehand.

This skill is retroactive only — it never plans a split before the diff exists. If no large
uncommitted diff is present when this skill is invoked, say so and stop; there is nothing to
split yet.

This skill is the entry point; it owns storage/naming/state-file conventions (below — shared by
both reference files) and routes to the process that applies:

| Situation | Read |
|---|---|
| No `.claude/pr-split/<slug>-state.json` exists yet for the current branch, or the user is starting a fresh split | `references/block-cycle.md`, from its "First invocation only: backup, then establish the baseline" section |
| A `.claude/pr-split/<slug>-state.json` already exists for the current branch with unfinished blocks (new session, or picking the work back up) | `references/resuming.md` |

Read only the reference the situation calls for — both assume this file's storage/schema/
classification conventions as shared background, so don't re-derive them per reference.

## Approval Gates

Every point in `references/block-cycle.md` where the user must approve, reject, or edit
something (the block's file grouping, the commit message, the PR title/body, the Plannotator
review outcome) is asked via `AskUserQuestion` with concrete options (e.g. "Approve" /
"Change grouping", "Approve" / "Edit message") — never by posting text in chat and waiting for a
free-form reply. This lets the user approve with a click instead of typing anything back. The
one exception is genuine data entry with no fixed option set — e.g. pasting a manually-created
PR's URL when `gh` isn't available (`references/block-cycle.md` Step 6) — which stays a normal
chat prompt, since there's nothing to choose between.

## File Classification

Extension/path heuristic — never guessed from file content:

- **Assets/docs (excluded from the 15-file cap):** `*.md`, `*.mdx`, `README*`, `CHANGELOG*`,
  images and fonts and other static files (`.svg .png .jpg .jpeg .gif .webp .ico .woff .woff2
  .ttf .eot .pdf`), locale files (`.po`, `.pot`).
- **Business logic (counts toward the cap):** everything else. Source files of any language,
  and config/test files (`.json`, `.yaml`, `.yml`, etc.) always count as logic — never
  reclassified by guessing at their semantic role.

## Grouping Priority

Grouping into blocks is this skill's own judgment from reading the diff (imports, symbol usage,
domain proximity) — not a rigid static algorithm. **Keeping coupled files together always
outranks the 15-file cap:** if a tightly-coupled group of files can't be split without leaving
one half referencing something the other half hasn't introduced yet, the cap is exceeded for
that one block. When that happens, flag it explicitly in the block proposal shown to the user and
get their confirmation on that specific point before moving on. There is no local build/lint/test
run to empirically confirm this — the project's own pre-push hook is the real check, at
`git push` time (`references/block-cycle.md` Step 6); a rejected push is the signal to regroup.

## Storage

- State file: `.claude/pr-split/<slug>-state.json`, where `<slug>` is the original source branch
  name (the branch the split started from) with `/` replaced by `-`.
- **Untracked.** Never `git add`ed, never committed, never part of any block's diff or any PR.
  It lives in the working tree only — it survives branch switches within the same checkout
  (untracked files aren't touched by `git checkout <branch>` unless they'd conflict), but it is
  not pushed and not backed up.
- **Deleted automatically once the split completes** — see Completion below. It is workflow
  state for an in-progress split, not a durable record; nothing else in the repo depends on it
  surviving past the last block's PR.
- **Backup branch:** `<sourceBranch>_backup` — a single ordinary commit holding the entire
  original diff, made before anything else touches it (`references/block-cycle.md` Step 0). This
  is the guarantee against data loss if something later in the split goes wrong; unlike the state
  file, this skill's own automation never deletes it — it is the human's safety net to clean up
  (or keep) at their own discretion, independent of when the split itself finishes.

## Completion

The split is complete once every block in `blocks` has reached `status: "pr-created"` and
`unassignedFiles` is empty. At that point, delete `.claude/pr-split/<slug>-state.json` as the
last action of the workflow and tell the user it's done — the split's job was tracking progress
while it was in flight, and once every block has a PR, `state.json` has nothing left to track.
This is unrelated to the backup branch (`<sourceBranch>_backup`, see Storage above), which this
skill's automation never deletes regardless of completion status.

## Editing the State File

`.claude/pr-split/<slug>-state.json` is a plain text file — read and edit it the same way as any
other file in the repo, with the `Read`/`Edit` tools, never through a shell one-liner (`jq`,
`python -c`, `node -e`, etc.). The file is small enough that every write in this skill (append a
block, flip a `status`, move a handful of paths between `unassignedFiles` and a block's `files`)
is a direct, visible text edit — there is no need for a JSON-processing tool in between.

## State File Schema

```json
{
  "sourceBranch": "feature-x",
  "baseBranch": "main",
  "createdAt": "2026-09-08T12:00:00Z",
  "updatedAt": "2026-09-08T12:00:00Z",
  "totalFiles": { "logic": 42, "assets": 7 },
  "originalFiles": ["src/a.ts", "src/z.ts", "README.md"],
  "blocks": [
    {
      "index": 1,
      "branch": "feature-x",
      "baseBranch": "main",
      "files": { "logic": ["src/a.ts"], "assets": ["README.md"] },
      "status": "approved",
      "commitSha": null,
      "prUrl": null
    }
  ],
  "unassignedFiles": ["src/z.ts"]
}
```

- `originalFiles` is the frozen, complete file list of the original diff, captured once at split
  start (before any block exists) and never re-derived afterward. It is the persistent ground
  truth the nothing-lost invariant checks against — see below. Block 1's `branch` is the source
  branch itself (`sourceBranch`), not a renamed/new branch — consistent with Branching & PR
  Strategy below.
- `status` progresses in this order and never skips backward: `planned` → `approved` →
  `committed` → `review-passed` → `pr-created`. There is no automated `closed` status — see
  Completion above. A block is written as `"planned"` at proposal time (`block-cycle.md` Step 1,
  before user approval) and flips to `"approved"` once the user approves it (Step 3) — see the
  invariant exception below for what that means for a `"planned"` block's files.
- `unassignedFiles` lists every file from the original diff not yet claimed by a block. A
  `"planned"` block's proposed files are still listed here — see below.
- **Nothing-lost invariant**, checked mechanically at every write to this file (never just
  visually): the union of every block's `files.logic` + `files.assets` **for blocks whose
  `status` is `"approved"` or later**, plus `unassignedFiles`, must equal exactly
  `originalFiles` (no file missing, no file duplicated across blocks). **Exception:** a block
  with `status: "planned"` is excluded from that union — its proposed files are only counted via
  `unassignedFiles` until approval flips it to `"approved"` (at which point `block-cycle.md`
  Step 3 removes those files from `unassignedFiles` in the same write, keeping the invariant
  holding at every step). `originalFiles` is captured once, at split start, with a single rename/
  space-safe command (`git status --porcelain=v1 -z`, null-delimited, parsed accordingly — not
  `awk '{print $2}'`, which mangles renames and paths with spaces) and never re-derived from the
  working tree afterward, since already-committed files no longer show up as uncommitted changes
  and would otherwise silently disappear from the check. If the union (per the exception above)
  doesn't match — a file appears in two blocks, or a file from `originalFiles` is in neither a
  block-in-scope nor `unassignedFiles` — stop and surface the mismatch to the user before doing
  anything else. Never silently drop or duplicate a file to make the invariant hold.

## Branching & PR Strategy

- The **current branch becomes block 1** — no renaming. Block 1's commit lands directly on it;
  its PR targets whatever that branch would normally target (recorded as `baseBranch` in the
  state file — ask the user if it isn't obvious from an existing PR/tracking branch).
- Block N+1 branches from block N's branch **after** block N's own commit exists there, named
  `<sourceBranch>-<N+1>` (e.g. `feature-x-2`, `feature-x-3`, ...). Its PR's base is block N's
  branch — this is a stacked chain, not everything based on `main`. Repointing a merged block's
  PR base back to `main` is left to the user, not automated here.
- PR creation: if `gh` is installed and the remote is a GitHub remote, use `gh pr create`.
  Otherwise, push the branch and ask the user to open the PR manually on whatever platform
  they use, then wait for them to paste back the PR URL before recording it and moving on —
  PR creation is delegated, never silently skipped.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Treating the 15-file cap as absolute and splitting apart tightly coupled files to respect it | Coupling wins — exceed the cap for that block, flag it, get explicit confirmation |
| Classifying a `.json`/`.yaml` config file as "not really logic" | Always business logic — extension-based classification only, never content-based |
| Committing or `git add`ing `.claude/pr-split/<slug>-state.json` | It stays untracked, always |
| Running a local build/lint/test step before committing a block | Out of scope for this skill — the project's own pre-push hook is the verification, at `git push` time |
| Basing every block's PR on `main` | Only block 1 targets the original base; every later block's PR bases on the previous block's branch |
| Silently proceeding when the nothing-lost invariant doesn't hold | Stop and surface the mismatch — never auto-drop or auto-duplicate a file to force it to balance |
| Starting the split without a backup branch, or deleting `<sourceBranch>_backup` as part of the workflow | `references/block-cycle.md` Step 0 always runs first, and the backup branch is never touched by this skill's own automation afterward |
| Leaving `.claude/pr-split/<slug>-state.json` on disk after the last block reaches `pr-created` | Delete it as the final action once `unassignedFiles` is empty — see Completion |
