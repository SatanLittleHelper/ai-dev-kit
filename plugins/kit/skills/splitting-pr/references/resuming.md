# Resuming a Split

Entry point when `splitting-pr` is invoked and a `.claude/pr-split/<slug>-state.json` already
exists for the current branch — a new session, or picking the work back up after closing the
previous one. Does no analysis or committing itself; it only figures out where the previous
session left off and hands off into `references/block-cycle.md`.

**REQUIRED BACKGROUND:** `splitting-pr/SKILL.md` — state file schema and status enum.
Hands off to `references/block-cycle.md` at a specific step.

## Process

### 1. Detect

Run `git branch --show-current` and check for a matching
`.claude/pr-split/<slug>-state.json` (`<slug>` = the current branch name if it *is* the
`sourceBranch`, or any block branch's ancestry — in practice: read every
`.claude/pr-split/*-state.json` present and match on `sourceBranch` or any `blocks[].branch`
equal to the current branch). No match → this isn't a resume, hand off to
`references/block-cycle.md` from its "First invocation only: backup, then establish the
baseline" section instead. If the current branch name ends in `_backup`, this is never a resume
target — tell the user they're on a backup branch, not the split's working branch, and stop
rather than treating it as either a fresh split or an in-progress one.

### 2. Report before acting

Never silently resume. Tell the user, plainly:
- Whether the plan is approved: `blocks` empty (nothing planned yet), blocks `planned` (plan
  drafted, awaiting approval), or `approved` onward.
- Which block is in progress (the first entry in `blocks` whose `status` isn't `pr-created`) and
  its current `status`; how many blocks have a PR out of the total.
- How many files remain in `unassignedFiles` (non-zero only while the plan is unapproved).

### 3. Resume at the right step

Map the in-progress block's `status` to where `references/block-cycle.md` picks back up:

| `status` | Resume at |
|---|---|
| `blocks` empty | Step 1 (Plan the whole split) |
| Blocks `planned` | Step 2 (Approve the plan) — re-open the existing `.claude/pr-split/<slug>-plan.md` in Plannotator rather than re-deriving it (regenerate the file from the `planned` entries in `state.json` if it's missing); `branch`/`baseBranch` are already recorded from Step 1 |
| `approved` | Step 4 (Commit) for the first unfinished block — `git add` the block's files and commit as usual; if it isn't block 1, first make sure its branch exists and is checked out (`git checkout -b` from the previous block's branch if not) |
| `committed` | Step 5 (Plannotator review) |
| `review-passed` | Step 6 (PR) |
| Every block `pr-created` | Not actually resumable — Step 7 deletes `state.json` once every block reaches this point (see `SKILL.md` → Completion), so finding this shape at all means that cleanup didn't run; tell the user the split already looks complete and confirm before deleting the file yourself |

Never jump straight to committing or creating a PR without re-confirming context with the user
first — Step 2 above already surfaces the state, but if anything looks stale (e.g. the working
tree doesn't match what `state.json` expects for the in-progress block), stop and ask rather
than forcing the mapped step.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Assuming the most recent `.claude/pr-split/*-state.json` belongs to the current branch | Match on `sourceBranch`/`blocks[].branch` against `git branch --show-current`, don't just pick the newest file |
| Re-deriving the plan when blocks are already `status: "planned"` | Re-open the existing plan in Plannotator instead of discarding it |
| Silently resuming without telling the user what was found | Step 2 is mandatory — always report before acting |
| Treating a `status: "pr-created"` block as "done" while later blocks remain | The split isn't finished until every block is `pr-created` — resume the next unfinished block at its mapped step |
