# Design: `splitting-pr` skill — safe retroactive PR splitting

## Context

When a large amount of work accumulates as an uncommitted diff on a single branch, the resulting PR becomes hard to review and risky to merge. The user wants a Claude Code skill (to be added to the `ai-dev-kit` repo under `skills/`, installable into any consuming project) that retroactively splits such a diff into a **stacked chain of PRs**, each small enough to review (≤15 business-logic files, assets/docs excluded) and each guaranteed to leave the build/app in a working state. No change may ever be silently dropped, and the whole process must be resumable across sessions.

This is a design doc only — no implementation yet. It will be handed to `writing-plans` after approval.

## Scope & Trigger

- **Retroactive only.** The skill acts on a diff that already exists (uncommitted changes on the current branch). It does not plan work proactively before it exists.
- New skill: `skills/splitting-pr/` in `ai-dev-kit`, following the `SKILL.md` + `references/*.md` pattern used by `skills/roadmap/`. Added to `OUR_SKILLS` in `setup.sh`.

## File classification

Extension/path heuristic (not semantic analysis):

- **Assets/docs (excluded from the 15-file cap):** `*.md`, `*.mdx`, `README*`, `CHANGELOG*`, images/fonts/static (`.svg .png .jpg .jpeg .gif .webp .ico .woff .woff2 .ttf .eot .pdf`, locale files `.po`/`.pot`).
- **Business logic (counts toward the cap):** everything else — source files of any language, and config/test files (`.json`, `.yaml`, etc.) are always treated as logic, never guessed by content.

## Grouping strategy

Grouping is Claude's own judgment from reading the diff (imports, symbol usage, domain proximity) — not a rigid static algorithm. **Build safety outranks the 15-file cap**: if a tightly-coupled group can't be split without breaking the build, the cap is exceeded for that block, explicitly flagged in the proposal, with its own confirmation step. The build/lint/test run (see below) is the empirical ground truth that catches coupling the analysis missed.

## Branching & PR strategy (stacked)

- The current branch (e.g. `feature-x`, already holding the big diff) **becomes block 1** — no renaming. Block 1 commits directly onto it; PR #1 targets whatever `feature-x` would normally target (`main`/base).
- Each subsequent block N+1 branches from block N's branch **after** block N's commit exists there, named `<sourceBranch>-<N+1>` (e.g. `feature-x-2`, `feature-x-3`, ...). Its PR's base is block N's branch (stacked). Once block N's PR merges, its base can be repointed at `main` — left to the user, not automated by the skill.
- **PR creation:** if `gh` is available and the remote is GitHub, use `gh pr create`. Otherwise (non-GitHub remote, or `gh` unavailable), the skill pushes the branch and asks the user to create the PR manually, then waits for the user to paste the PR URL before recording it and moving on — PR creation is never silently skipped, just delegated.

## State file (`.claude/pr-split/<slug>-state.json`)

- **Untracked**, never committed, never part of any PR diff. Lives in the working tree so it survives branch switches within the same repo checkout, but is not pushed/backed up and does not need a commit-time cleanup step.
- Schema:

```json
{
  "sourceBranch": "feature-x",
  "baseBranch": "main",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "totalFiles": { "logic": 42, "assets": 7 },
  "blocks": [
    {
      "index": 1,
      "branch": "feature-x-1",
      "baseBranch": "main",
      "files": { "logic": ["src/a.ts"], "assets": ["README.md"] },
      "status": "planned",
      "commitSha": null,
      "prUrl": null
    }
  ],
  "unassignedFiles": ["src/z.ts"]
}
```

- `status` progression: `planned → approved → committed → review-passed → pr-created → closed`.
- **Nothing-lost invariant**, checked mechanically (not visually) at every step: `unassignedFiles` is empty **iff** the union of every block's `files` equals the full file list of the original diff. The skill computes this by diffing the recorded state against `git status`/`git diff --name-only` output each time it touches the state file.

## Per-block workflow (repeats until `unassignedFiles` is empty)

1. **Analyze** — Claude proposes the next block (≤15 logic files where possible) from `unassignedFiles`, with reasoning.
2. **Approve plan** — user confirms or edits the grouping.
3. **Record** — write `state.json` (`status: planned → approved`).
4. **Isolate & verify build** — `git add <block files>` → `git stash push --keep-index -u -m pr-split-<slug>-<n>` (unique tag, per this environment's stash-safety rule: tagged push, `apply` not `pop`, explicit `drop` after) → run the project's build/lint/test → on failure: `git stash apply` + `git stash drop` to restore, go back to step 1 to regroup (offending file(s) stay unassigned or get folded into this block).
5. **Commit** — on success, draft the commit message and get explicit user approval before `git commit` (per this repo's `git-and-commits.md` — draft shown, confirmed, then committed). Then `git stash apply` + `git stash drop` to restore the remaining diff for the next block. `state.json`: `status: committed`, `commitSha` recorded.
6. **Plannotator review** — invoke the `plannotator-review` skill against the current worktree. Apply any requested changes; once the user explicitly approves, `status: review-passed`.
7. **PR** — per the PR strategy above (`gh` or manual-delegated). `status: pr-created`, `prUrl` recorded.
8. **Next branch** — create `<slug>-<n+1>` from the current (block N) branch tip and switch to it; the remaining diff is still present there. Loop to step 1.

## Resuming across sessions

No separate "resume" command. On invocation, the skill inspects the **current branch name** plus a matching `.claude/pr-split/<slug>-state.json`. If one exists with unfinished blocks, it reports the current state (last completed step, next pending action) and continues from there — it never silently assumes; it always states what it found before acting.

## Completion

The loop ends when `unassignedFiles` is empty. The skill does not auto-delete `state.json` — cleanup is left to the user once they're satisfied the final PR is merged.

## Open implementation details for `writing-plans`

- Exact `SKILL.md` frontmatter/description (auto-trigger phrases like "разбей PR", "слишком много файлов в PR").
- `references/` breakdown (e.g. `references/analysis.md`, `references/block-cycle.md`) mirroring the `roadmap` skill's routing-table pattern.
- Concrete detection of the project's build/lint/test commands (package.json scripts, Makefile, etc.) and how failures are surfaced to the user.
