# Block Cycle

The repeatable loop for one block, from proposal to PR. Repeats until every file from the
original diff is accounted for (`unassignedFiles` in `.claude/pr-split/<slug>-state.json` is
empty — schema and invariant defined in `splitting-pr/SKILL.md`).

**REQUIRED BACKGROUND:** `splitting-pr/SKILL.md` — storage location, file classification,
grouping priority (build safety over the 15-file cap), branching/PR strategy, state file schema.
Read it first; this reference only covers the step-by-step mechanics.

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
pre-Step-0 shape: modified tracked files unstaged, new files untracked. Without it, every file
would already be staged going into Step 4, which stages only the block's files and relies on
everything else being *unstaged* so `git stash push --keep-index` hides it — with everything
pre-staged, that stash would keep the whole remaining diff visible instead of just the block,
silently defeating the isolation the build check depends on. Verify with `git status` that the
file set **and** staged/unstaged shape both match what was there before backing up.

Never delete `<sourceBranch>_backup` as part of this skill's own automation — it is a safety net
for the human, not workflow state, and outlives the split itself (unlike `state.json`, which the
user may clean up once every block's PR has merged — see `SKILL.md` → Completion). If a later
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
cap. If the only build-safe grouping exceeds 15 business-logic files, say so explicitly and
explain why the group can't be split further (name the specific coupling — e.g. "file A imports
a type only defined in file B").

Immediately after proposing it — before asking for approval — persist the proposal to
`state.json` as a new entry in `blocks` with `status: "planned"`, and write that entry's `branch`
and `baseBranch` now too (both are already derivable at proposal time, no need to wait for
approval):

- `branch` is the block's own branch name: for block 1, `sourceBranch`; for block N+1, whatever
  branch Step 8 of the previous block already created and switched to — i.e. `git branch
  --show-current` at the moment this step runs (the branch already exists by this point; Step 8
  of the previous block created it and switched to it before looping back here).
- `baseBranch` is: for block 1, the state file's top-level `baseBranch`; for block N+1, the
  previous block's `branch` value.

Its files stay in `unassignedFiles` at this point (per `SKILL.md`'s nothing-lost invariant
exception for `"planned"` blocks) — only the proposal, `branch`, and `baseBranch` are recorded.
Update `updatedAt`. This is what makes an in-progress proposal resumable if the session ends
before the user approves it, with the branch already known — see `references/resuming.md`'s
`"planned"` row.

## Step 2: Approve plan

Show the proposal to the user in chat (the file list plus the reasoning) and wait for explicit
approval or rejection. Do not proceed on an assumed "looks fine" — wait for the user's actual
response. This step makes no file write of its own — a crash between Step 1 and Step 2 simply
leaves the `"planned"` block in place for `resuming.md` to re-show.

If the user wants to change the grouping (move files between this block and `unassignedFiles`,
regroup differently, etc.), that is not an edit made here — treat it as going back to Step 1 to
re-propose. The fresh Analyze pass re-writes the same `"planned"` block entry (same `index`,
still `status: "planned"`, `branch`/`baseBranch` unchanged since the branch itself hasn't moved)
with the updated file list, and Step 2 repeats against the revised proposal.

## Step 3: Record

On approval, update the block's existing entry (created in Step 1 as `"planned"`, `branch` and
`baseBranch` already set there): set `status: "approved"` and remove its files from
`unassignedFiles`. That's the whole step — `branch`/`baseBranch` were already written in Step 1
and don't change here.

Update `updatedAt`. Re-run the nothing-lost invariant check from `SKILL.md` before continuing —
if it fails, stop and surface the mismatch rather than proceeding into step 4.

## Step 4: Isolate and verify the build

Stage only this block's files, then hide everything else from the working tree with a uniquely
tagged stash (never bare `git stash`):

```bash
git add <block file 1> <block file 2> ...
TAG="pr-split-<slug>-<block-index>"
git stash push --keep-index -u -m "$TAG"
```

With only the staged block's changes now present in the working tree, run the project's actual
build/lint/test commands (detect from `package.json` scripts, a `Makefile`, or ask the user if
neither is present — do not assume a command that isn't actually configured in this project).

Whenever this stash needs to be restored (failure below, or Step 6's success path, possibly in a
different session), resolve its `stash@{n}` reference fresh by tag rather than carrying a
captured value across steps — `git stash drop` only accepts a `stash@{n}` reference, not a bare
commit SHA (`apply` accepts either, `drop` does not), and indices can shift if anything else
touches the stash stack in between:

```bash
STASH_REF=$(git stash list --format='%gd %gs' | grep -F "$TAG" | head -1 | awk '{print $1}')
```

(`head -1` takes the most recent match — the stash stack is newest-first — in case an earlier,
already-superseded entry with the same tag was ever left behind.)

- **On failure:** restore immediately, do not leave the tree in the stashed state:
  ```bash
  git stash apply "$STASH_REF"
  git stash drop "$STASH_REF"
  git reset
  ```
  The trailing `git reset` matters here for the same reason it did in Step 0: `apply` restores
  the stash on top of an index that `--keep-index` deliberately left holding this block's staged
  files, so without the reset those files stay staged even though the attempt failed. Left
  staged, they'd silently leak into a later block's isolation if that block's own proposal
  doesn't happen to `git add` them again — `git stash push --keep-index` only hides what's
  *unstaged*, so anything still staged from this failed attempt would stay visible instead of
  being isolated away. The reset returns every file to the same unstaged/untracked shape it had
  before this attempt, regardless of how the next proposal groups them.

  The block never reached `committed`, so it gets no status — remove its entry from
  `state.json`'s `blocks` array entirely and return all of its files to `unassignedFiles` (the
  offending file(s) can be folded into a future block's proposal, or left to be regrouped
  differently). Re-run the nothing-lost invariant check. Return to Step 1 to regroup. Explain to
  the user what broke and why.
- **On success:** keep the stash in place — the working tree needs to stay isolated to just this
  block through Steps 5 and 6 (commit, then Plannotator review), and only gets restored at the
  end of Step 6 — and continue.

## Step 5: Commit

Draft the commit message for this block's staged changes and show it to the user for explicit
approval before running `git commit` (per this repo's `rules/base/git-and-commits.md`: past
tense, one line, language matching the conversation, ticket prefix from
`.claude/dev-conventions.json` if the project tracks one). Only after the user confirms the
exact text:

```bash
git commit -m "<approved message>"
```

Do **not** restore the Step 4 stash yet. Update `state.json`: `status: "committed"`, `commitSha`
set to the new commit's SHA (`git rev-parse HEAD`). The working tree stays isolated to just this
block's commit — the rest of the diff stays hidden in the stash — through Step 6, so Plannotator
reviews only this block, not the whole remaining diff.

## Step 6: Plannotator review

Invoke the `plannotator-review` skill (it has `disable-model-invocation: true`, so it must be
invoked explicitly by name, not expected to auto-trigger) against the current worktree, which at
this point holds only this block's just-made commit (the rest of the diff is still hidden in the
Step 4 stash) — so the review is actually scoped to this block, not the whole remaining diff.
Apply any requested changes in the same conversation. A skill invocation, not a shell command:

> Invoke skill `plannotator-review` with no arguments (reviews the current worktree).

Once the user explicitly approves (an LGTM-style result, or after requested changes are applied
and re-approved), set `state.json` `status: "review-passed"`, **then** restore the stash to bring
back the remaining diff for the next block — resolve the `stash@{n}` reference fresh by tag
(same lookup as Step 4, whether this is the same session or a resumed one):

```bash
TAG="pr-split-<slug>-<block-index>"
STASH_REF=$(git stash list --format='%gd %gs' | grep -F "$TAG" | head -1 | awk '{print $1}')
git stash apply "$STASH_REF"
git stash drop "$STASH_REF"
```

## Step 7: PR

Check whether `gh` is installed and the remote is GitHub:

```bash
command -v gh >/dev/null 2>&1 && git remote get-url origin | grep -q 'github.com'
```

- **If yes:** push the branch and create the PR:
  ```bash
  git push -u origin <block branch>
  gh pr create --base <block's baseBranch> --head <block branch> --title "<title>" --body "<body>"
  ```
  Draft title/body from the block's commit message and reasoning; confirm with the user before
  running `gh pr create` (same approval discipline as the commit message).
- **If no:** push the branch, tell the user the PR must be created manually on their platform
  with the correct base (`<block's baseBranch>`), and wait for them to paste back the created
  PR's URL. Do not proceed to Step 8 until it's provided.

Record the URL: `state.json` `status: "pr-created"`, `prUrl` set.

## Step 8: Next branch

If `unassignedFiles` is now empty, the split is done — tell the user, and stop (no Step 8
branch needed). Otherwise:

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
| Running `git stash` / `git stash pop` without a unique tag | Always `push -m "pr-split-<slug>-<n>"`, restore with `apply` + explicit `drop`, never bare `pop` |
| Committing before the build check passes | Build check (Step 4) is a hard gate before Step 5 — a failure sends you back to Step 1, not forward |
| Skipping Step 6 because the diff "looks small" | Plannotator review runs on every block regardless of size |
| Assuming `gh pr create` works without checking the remote is GitHub | Always check `gh` + GitHub remote first; fall back to manual delegation otherwise |
| Branching block N+1 before block N is committed | Step 8 only runs after Steps 4–7 of block N are fully done |
| Leaving the working tree in a stashed state after a build failure | Always `apply` + `drop` immediately on failure, before doing anything else |
| Restoring the Step 4 stash right after `git commit` in Step 5 | Keep the stash in place through Step 6 — Plannotator must review only this block's commit, not the whole remaining diff |
| Setting a failed block's `status` to some ad hoc "not committed" value | It never reached `committed` — remove its entry from `blocks` entirely and return its files to `unassignedFiles` |
| Writing the baseline file list to a `/tmp` file | Baseline lives in `state.json`'s `originalFiles` field, never an external temp file |
| Leaving `branch`/`baseBranch` unset on a block | Step 1 sets both at proposal time — block 1 from `sourceBranch`/top-level `baseBranch`, block N+1 from the current branch/previous block's `branch` — Step 3 only flips `status` and clears `unassignedFiles` |
| Carrying a captured stash SHA/ref across steps or sessions instead of re-resolving it | `git stash drop` doesn't accept a bare commit SHA (only `stash@{n}`) and indices can shift — always resolve fresh via `git stash list --format='%gd %gs' \| grep -F "pr-split-<slug>-<n>" \| head -1` right before use |
| Skipping `git reset` after Step 0's `git cherry-pick -n` | Without it every file is left staged, so Step 4's `git add <block files>` + `stash --keep-index` can't isolate anything — the whole remaining diff stays visible |
| Skipping `git reset` after a Step 4 build-failure restore | Without it, this attempt's staged files leak into whatever block gets proposed next, even if that block doesn't include them |
