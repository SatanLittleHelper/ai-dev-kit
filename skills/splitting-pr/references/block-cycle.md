# Block Cycle

The repeatable loop for one block, from proposal to PR. Repeats until every file from the
original diff is accounted for (`unassignedFiles` in `.claude/pr-split/<slug>-state.json` is
empty — schema and invariant defined in `splitting-pr/SKILL.md`).

**REQUIRED BACKGROUND:** `splitting-pr/SKILL.md` — storage location, file classification,
grouping priority (coupling over the 15-file cap), branching/PR strategy, state file schema.
Read it first; this reference only covers the step-by-step mechanics.

This skill runs no local build/lint/test step of its own — verification is whatever the
project's own pre-push hook already does at `git push` (Step 6 below). There is no stash-based
isolation either: each block is committed directly with `git add <block files>` + `git commit`,
and everything else in the working tree simply stays unstaged/untracked until its own turn comes.

## First invocation only: backup, then establish the baseline

### Step 0: Backup branch

Before touching the original diff in any way — before classification, before the baseline
capture below — put a complete, untouched copy of it somewhere splitting can never lose it, even
if a later step in this process goes wrong:

```bash
git checkout -b <sourceBranch>_backup
git add -A
git commit -m "backup: full pre-split snapshot of <sourceBranch> before splitting"
git checkout <sourceBranch>
git cherry-pick -n <sourceBranch>_backup
git reset
```

This creates `<sourceBranch>_backup` holding one commit with the entire original diff — a
durable, ordinary commit, not a stash, so it survives independently of anything the split does
afterward. `git cherry-pick -n` (no-commit) re-applies that same content back onto `sourceBranch`
as uncommitted changes, but leaves everything **staged** — the final `git reset` (no path,
unstages everything while keeping the working-tree content) is required to get back to the exact
pre-Step-0 shape: modified tracked files unstaged, new files untracked. This isn't optional
cleanup — every later step's file isolation depends on it. Step 4's commit works by staging
*only* the block's files and running a bare `git commit`, which commits the entire index; if
everything were still staged from this step, that bare commit would silently commit the whole
remaining diff instead of just the block. Verify with `git status` that the file set **and**
staged/unstaged shape both match what was there before backing up.

Never delete `<sourceBranch>_backup` as part of this skill's own automation — it is a safety net
for the human, not workflow state, and outlives the split itself (unlike `state.json`, which this
skill deletes automatically once the split completes — see `SKILL.md` → Completion). If a later
step ever needs to recover from something going badly wrong, this branch is the fallback: the
original, unsplit diff, always available via `git diff main...<sourceBranch>_backup` (or
whatever the real base is).

### Baseline

Before step 1 of the first block, capture the full original diff's file list once and freeze it
— this is what the nothing-lost invariant checks every block against, so it must not silently
shift as blocks get committed:

```bash
git status --porcelain=v1 -z
```

Null-delimited output, parsed accordingly (not `awk '{print $2}'`, which mangles renames and
paths with spaces) — this is the one and only place the file list is derived from the live
working tree. Classify every path per `SKILL.md`'s File Classification rule, then create
`.claude/pr-split/<slug>-state.json` (path per `SKILL.md` → Storage) with `sourceBranch` set to
`git branch --show-current`, `baseBranch` asked from the user if not obvious, `totalFiles` set
from the classified counts, `originalFiles` set to this full file list (logic + assets combined,
frozen — never re-derived afterward), `blocks: []`, and `unassignedFiles` also set to the full
list initially.

## Step 1: Analyze

Propose the next block from `unassignedFiles`: which files, why grouped together (imports,
shared symbols, same feature area), and the resulting business-logic file count vs. the 15-file
cap. If the only coupling-safe grouping exceeds 15 business-logic files, say so explicitly and
explain why the group can't be split further (name the specific coupling — e.g. "file A imports
a type only defined in file B"). There is no build check here to fall back on — this judgment
call, and the user's confirmation of it in Step 2, is the only gate before the project's own
pre-push hook eventually weighs in at Step 6.

Immediately after proposing it — before asking for approval — persist the proposal to
`state.json` as a new entry in `blocks` with `status: "planned"`, and write that entry's `branch`
and `baseBranch` now too (both are already derivable at proposal time, no need to wait for
approval):

- `branch` is the block's own branch name: for block 1, `sourceBranch`; for block N+1, whatever
  branch Step 7 of the previous block already created and switched to — i.e. `git branch
  --show-current` at the moment this step runs (the branch already exists by this point; Step 7
  of the previous block created it and switched to it before looping back here).
- `baseBranch` is: for block 1, the state file's top-level `baseBranch`; for block N+1, the
  previous block's `branch` value.

Its files stay in `unassignedFiles` at this point (per `SKILL.md`'s nothing-lost invariant
exception for `"planned"` blocks) — only the proposal, `branch`, and `baseBranch` are recorded.
Update `updatedAt`. This is what makes an in-progress proposal resumable if the session ends
before the user approves it, with the branch already known — see `references/resuming.md`'s
`"planned"` row.

## Step 2: Approve plan

Show the proposal in chat (the file list plus the reasoning), then ask for approval via
`AskUserQuestion` (per `SKILL.md` → Approval Gates) with options along the lines of "Approve this
block" / "Change the grouping" — not a free-text prompt waited on in chat. Do not proceed on an
assumed "looks fine". This step makes no file write of its own — a crash between Step 1 and
Step 2 simply leaves the `"planned"` block in place for `resuming.md` to re-show.

If the answer is "change the grouping" (move files between this block and `unassignedFiles`,
regroup differently, etc.), that is not an edit made here — treat it as going back to Step 1 to
re-propose, using whatever the user specified. The fresh Analyze pass re-writes the same
`"planned"` block entry (same `index`, still `status: "planned"`, `branch`/`baseBranch` unchanged
since the branch itself hasn't moved) with the updated file list, and Step 2 repeats against the
revised proposal.

## Step 3: Record

On approval, update the block's existing entry (created in Step 1 as `"planned"`, `branch` and
`baseBranch` already set there): set `status: "approved"` and remove its files from
`unassignedFiles`. That's the whole step — `branch`/`baseBranch` were already written in Step 1
and don't change here.

Update `updatedAt`. Re-run the nothing-lost invariant check from `SKILL.md` before continuing —
if it fails, stop and surface the mismatch rather than proceeding into Step 4.

## Step 4: Commit

Stage only this block's files and commit them — nothing else in the working tree is touched:

```bash
git add <block file 1> <block file 2> ...
```

Draft the commit message (per this repo's `rules/base/git-and-commits.md`: past tense, one line,
language matching the conversation, ticket prefix from `.claude/dev-conventions.json` if the
project tracks one), show it in chat, then ask for approval via `AskUserQuestion` ("Approve this
message" / "Edit it") rather than waiting for free text. If the user picks "edit", take their
replacement text as the approved message — don't re-ask with the same draft. Only after approval:

```bash
git commit -m "<approved message>"
```

Because Step 0's baseline established a clean staged/unstaged split (nothing pre-staged beyond
what each step explicitly adds), `git add <block files>` followed by a bare `git commit` commits
*exactly* those files — everything else stays as ordinary unstaged/untracked changes in the
working tree, visible in `git status` but not part of this commit. There is no stash to manage
and nothing to restore afterward. Update `state.json`: `status: "committed"`, `commitSha` set to
the new commit's SHA (`git rev-parse HEAD`).

## Step 5: Plannotator review

Invoke the `plannotator-review` skill (it has `disable-model-invocation: true`, so it must be
invoked explicitly by name, not expected to auto-trigger) against the current worktree — no
special arguments needed:

> Invoke skill `plannotator-review` with no arguments (reviews the current worktree).

`plannotator review --git` reviews commits since the current branch diverged from its
base/upstream. Since block 1's branch is `sourceBranch` itself and every block N+1's branch is
created fresh in Step 7 with exactly one commit added on top (this block's), that diff is already
scoped to just this block's commit — no extra isolation step is needed to keep the review
focused, the stacked-branch structure does it by construction.

If Plannotator's result carries feedback/annotations, apply the requested changes in the same
conversation (as a further commit or amendment to this block, per the user's own commit-approval
discipline — same as Step 4) and re-run the review. If the result is already an LGTM-style
approval with nothing to address, confirm moving on via `AskUserQuestion` ("Continue to PR" /
"Request more changes") rather than assuming silence means yes. Once confirmed, set `state.json`
`status: "review-passed"`.

## Step 6: PR

Check whether `gh` is installed and the remote is GitHub:

```bash
command -v gh >/dev/null 2>&1 && git remote get-url origin | grep -q 'github.com'
```

- **If yes:** draft the PR title/body from the block's commit message and reasoning, show it in
  chat, and ask for approval via `AskUserQuestion` ("Approve this PR" / "Edit title/body") —
  same discipline as the commit message. Only after approval:
  ```bash
  git push -u origin <block branch>
  gh pr create --base <block's baseBranch> --head <block branch> --title "<title>" --body "<body>"
  ```
- **If no:** push the branch, tell the user the PR must be created manually on their platform
  with the correct base (`<block's baseBranch>`), and ask them to paste back the created PR's
  URL — plain data entry, not an approve/reject choice, so a normal chat prompt (per `SKILL.md` →
  Approval Gates). Do not proceed to Step 7 until it's provided.

`git push` is also where this project's own pre-push hook (if any) runs — this skill has no
build/lint/test step of its own, so a hook rejecting the push here is the first and only
automated signal that something about this block is broken. If that happens:

- The commit already exists locally — don't try to auto-revert or reset it. Show the hook's
  actual output to the user and let them decide how to fix forward (amend the commit, add a
  follow-up fix, or reconsider the grouping for a *future* block if the hook flagged something
  that spans beyond this one).
- Do not mark `status: "pr-created"` or set `prUrl` until the push actually succeeds.

Once the push (and PR, if applicable) succeeds: record the URL, `state.json` `status:
"pr-created"`, `prUrl` set.

## Step 7: Next branch

If `unassignedFiles` is now empty, the split is done — delete
`.claude/pr-split/<slug>-state.json` (per `SKILL.md` → Completion), tell the user, and stop (no
Step 7 branch needed). Otherwise:

```bash
git checkout -b <sourceBranch>-<N+1>
```

branched from the current (block N) branch tip, which already carries block N's commit. The
remaining diff (everything still in `unassignedFiles`) is still present as uncommitted changes
in this new branch's working tree, since `git checkout -b` from a branch tip doesn't touch
uncommitted/untracked changes. Loop back to Step 1 — Step 1 of the new block will record this
branch as its own `branch` (via `git branch --show-current`) as soon as it's proposed.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Running a build/lint/test command before committing a block | Out of scope — the project's own pre-push hook is the verification, at Step 6's `git push` |
| Skipping Step 5 because the diff "looks small" | Plannotator review runs on every block regardless of size |
| Assuming `gh pr create` works without checking the remote is GitHub | Always check `gh` + GitHub remote first; fall back to manual delegation otherwise |
| Branching block N+1 before block N is committed | Step 7 only runs after Steps 4–6 of block N are fully done |
| Treating a pre-push hook rejection at Step 6 as something to silently retry or bypass (`--no-verify`) | Show the hook's output to the user and let them decide how to fix forward |
| Setting a failed block's `status` to some ad hoc value when a push is rejected | The commit still exists and stays `"committed"` — a rejected push isn't a build failure with a defined rollback, it's a stop-and-ask |
| Writing the baseline file list to a `/tmp` file | Baseline lives in `state.json`'s `originalFiles` field, never an external temp file |
| Leaving `branch`/`baseBranch` unset on a block | Step 1 sets both at proposal time — block 1 from `sourceBranch`/top-level `baseBranch`, block N+1 from the current branch/previous block's `branch` — Step 3 only flips `status` and clears `unassignedFiles` |
| Skipping `git reset` after Step 0's `git cherry-pick -n` | Without it every file is left staged, so Step 4's bare `git commit` would commit the entire remaining diff instead of just the block |
| Leaving `.claude/pr-split/<slug>-state.json` on disk once `unassignedFiles` is empty | Delete it as the last action of Step 7 — see `SKILL.md` → Completion |
| Waiting for a free-text chat reply to approve grouping/commit/PR | Use `AskUserQuestion` with concrete options at every approval gate — see `SKILL.md` → Approval Gates |
| Editing `state.json` via a shell one-liner (`jq`, `python -c`, ...) | Read/Edit it as plain text, like any other file — see `SKILL.md` → Editing the State File |
