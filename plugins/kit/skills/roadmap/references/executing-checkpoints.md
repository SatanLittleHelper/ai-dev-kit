# Executing Roadmap Checkpoints

Drives one roadmap checkpoint from "find it" to "check it off": locate the roadmap, pick the first unfinished checkpoint, branch correctly, agree on an implementation mode, then close out (checkbox + cleanup) once done.

**REQUIRED BACKGROUND:** `roadmap/SKILL.md` (file locations/naming used below, including the per-step `steps/<step-slug>/` folder). Implementation itself is delegated to `superpowers:writing-plans`, `superpowers:subagent-driven-development`/`superpowers:executing-plans`, or `codex-implement` — this reference sequences them, it doesn't replace them.

Use this reference when the user names a specific checkpoint/task and asks to take/start it. For a generic "continue the roadmap" request that doesn't specify implementation vs. documentation, use `references/resuming-work.md` first — it decides whether this reference or `references/batch-plan-validate.md` applies.

## Process

### 0. Fresh main and PR sync

Run `references/sync-and-isolate.md` sections A and B before anything else — in both cases (working from the default branch or from a roadmap-related branch). The rest of this reference reads roadmap data as of the latest `origin/<default>` plus the in-flight PR overlay.

### 1. Find the roadmap

- User named a feature/roadmap → use `docs/<slug>/*-roadmap.md`.
- Otherwise glob `docs/*/*-roadmap.md`.
  - Exactly one match → use it.
  - Zero matches → tell the user no roadmap was found, stop.
  - Multiple matches → `AskUserQuestion`, one option per roadmap (label = feature slug), never guess.

### 2. Find the next checkpoint

Read the roadmap top to bottom and collect every unchecked `- [ ] <TICKET> <name>` line, in document order. For each one, check its `(depends: <id>...)` tag, if any, against `docs/<slug>/roadmap-state.json` — and, for `<other-slug>:<id>` entries, against `docs/<other-slug>/roadmap-state.json` (`roadmap/SKILL.md` → `## Dependencies`, including the rules for a missing folder/state file and a broken reference): it's **ready** if the tag is absent/empty or every listed id is satisfied; otherwise it's **blocked** (say which roadmap's checkpoint it waits on). If `roadmap-state.json` doesn't exist for this roadmap, fall back to checking each dependency id's own checkbox directly in the roadmap markdown (`- [x]` = satisfied).

- No unchecked line exists → the roadmap is already fully done. Report this and ask whether to delete it now (see step 6); do not delete unasked when you didn't just finish the work yourself.
- A checkpoint that is in flight in an open PR (`references/sync-and-isolate.md` section B) is never ready, whatever its `main` status says.
- A checkpoint blocked only by dependencies that are `closed` in one open PR's branch is **stackable** (`references/sync-and-isolate.md` section B item 5): treat it as a candidate next to the ready ones, labelled «стек на PR #N».
- Exactly one ready checkpoint → that's the next checkpoint.
- More than one ready or stackable checkpoint → the ready ones are safe to work in parallel. `AskUserQuestion`, one option per ready or stackable checkpoint (label = its id + short name; stackable ones add «стек на PR #N»), and let the user pick which to take now — never guess by document order once more than one checkpoint is actually ready.
- No ready checkpoint but unchecked lines remain → everything left is blocked on something not yet closed; report which checkpoints are blocked and what each is waiting on, then stop — don't silently wait or invent an order.
- Ticket is the literal placeholder `TBD` → tell the user this checkpoint has no real ticket yet and ask whether to create one (offer `jira-writer` or equivalent) or proceed ticket-less.

### 3. Branch

1. Working tree must be clean; if not, tell the user and stop — don't stash or discard anything.
2. Get the current branch name. Deterministic relation check: does it contain the checkpoint's ticket ID as a substring (case-insensitive)? That's the only signal — don't infer relation from vibes/branch topic.
   - **Match** (stacked work) → the new branch is cut from the **current** branch, after its gap with `origin/<default>` was handled in `references/sync-and-isolate.md` section A. Still a distinct new branch; never keep working on the branch you branched from.
   - **Stackable checkpoint chosen** → the base is the blocker PR's head branch, not the current branch and not `origin/<default>`: `git fetch origin <headRef>`, then `git switch -c <name> --no-track origin/<headRef>`. Skip the base question and the default-branch gap check of section A for this branch. Read the blocker's state (and the other dependencies) from this branch. Tell the user in the status update that the PR of this step must target `<headRef>` as its base and be retargeted to the default branch once PR #N merges; never create or retarget the PR unasked.
   - **No match** → `AskUserQuestion`: which branch to base the new one on, with `origin/<default>` as the recommended first option.
3. If the base is the default branch (not a stack), `git fetch origin` and cut from `origin/<default>` (`git switch -c <name> --no-track origin/<default>`), never from a stale local copy.
4. Name the new branch per the repo's own branch-naming rules if documented (check `CLAUDE.md`/`AGENTS.md`/`.claude/rules`); otherwise default to the bare `<ticket>` (no slug/description suffix) and state the chosen name in your status update so the user can redirect before it's created.
5. Never commit directly to the base branch.
6. Isolate the branch: run `references/sync-and-isolate.md` section C so only this roadmap's `docs/<slug>/` remains in the working tree.
7. Go straight to step 4 and start the first planning document (the test plan, or the implementation plan if the step has no test-worthy layer) without asking for confirmation. Branch setup and isolation are not a checkpoint: the document goes through its own Plannotator approval anyway. Report branch, ticket and isolation in the same turn as the first planning action, not as a separate "start?" question.

### 4. Hand over to task-flow

From here the checkpoint is a task. If `docs/<slug>/roadmap-state.json` exists and this checkpoint's `stepFolder` is empty, first set it to `docs/<slug>/steps/<step-slug>/` and refresh `updatedAt` (never overwrite a folder that is already set; the flow finds the entry by this folder, matching by id is only a fallback). Without the state file continue without it: the flow then simply does not sync. Then start the flow and follow the `task-flow` skill.

```
node <base>/../../tools/flow/cli/main.mts start <id> --step-dir docs/<slug>/steps/<step-slug> [--no-tracker]
```

- `<id>` is the checkpoint's real ticket key, or the checkpoint id (`A1`, `F2`) while its ticket is `TBD`; add `--no-tracker` when `<id>` is not a Jira key. `<step-slug>` comes from the checkpoint's own heading — ask the user if it is ambiguous, never invent one silently.
- Existing approved documents are registered, not rewritten: if the step's `status` is `spec-validated` and `specPath` exists, run `flow skip spec --reason "approved: <specPath>"`; if it is `plan-drafted` (the documents were approved earlier, a saved file is the proof), do the same for `spec`, then `flow skip test-plan --reason "approved: <testPlanPath>"` when `testPlanPath` is set (otherwise `combined: …`) and `flow skip plan --reason "approved: <planPath>"`, and continue from the method question. The registered file's path and hash become the stage's evidence, so a later edit resets the stages. A `spec-drafted` design is not an approval: write the spec through the flow instead. A step that is `implemented` goes straight to close-out.
- The flow then carries the order: spec, test plan (skipped as `combined` for a single-task plan), plan, the method question and implementation, simplify, check, local test, review, PR. It runs the document approvals and keeps this checkpoint's entry in `roadmap-state.json` up to date: `stepFolder`, `specPath`, `testPlanPath`, `planPath` and `status` up to `implemented`; it never lowers a status and never touches a `closed` step.
- Once the plan is written, re-check the step's estimate against it (`roadmap/SKILL.md` → `## Estimates`): update `estimate` (+ `basis: "plan-drafted"`) and the `(est: ...)` tag, recompute the roadmap's `## Оценка`. If `manual.max` now exceeds 3д, tell the user the step should be split before implementing.
- A design doc in the step folder (from `brainstorming`, written at roadmap-authoring time) is carried forward as-is, never regenerated. Skip the plan requirement only if the user explicitly says the checkpoint is trivial enough to go straight to code.

### 5. Let the flow finish the work

Do not drive the stages by hand here: `flow status` shows where the checkpoint is, and the `task-flow` skill says what to do next. The checkpoint is ready for close-out when the `review` stage is closed and the flow is at `pr`.

### 6. Close out the checkpoint

Run it after the `review` stage is closed and before the `pr` stage, so the close-out lands in the same commit as the PR:

1. If the flow did not already set `status` to `"implemented"` in `docs/<slug>/roadmap-state.json`, set it now.
2. Edit the roadmap file: flip this checkpoint's `- [ ]` to `- [x]`. Touch only this line.
3. Delete only the checkpoint's implementation plan file (`docs/<slug>/steps/<step-slug>/YYYY-MM-DD-<ticket>-<name>.md`) and its test plan file (`...-<name>-tests.md`, if one was written) — they are mechanical execution artifacts, same as any other plan. Leave the step's design doc (if any) in that folder in place: like the roadmap itself, they're kept as permanent history, not deleted after implementation. If the plan files were the only files in the step folder, delete the now-empty folder too.
4. If `roadmap-state.json` exists, set this checkpoint's `status` to `"closed"`, `planPath` to `null`, and `testPlanPath` to `null` (the plan files were just deleted in the previous step). Also record `estimate.actualDays` (real elapsed working days; ask via `AskUserQuestion` if it isn't obvious from the branch dates — never invent it) and recompute the roadmap's `## Оценка` "Осталось" row. Skip both if the step has no `estimate`.
5. If that was the **last** remaining `- [ ]` in the roadmap, also delete the roadmap file itself, and the `docs/<slug>/` folder if it's now empty (this removes any remaining step design docs — and `roadmap-state.json` itself — along with it, same as deleting a fully-shipped roadmap always has).
6. Do not `git add`/`git commit` any of this — commit only on explicit user request, same as everywhere else.
7. Run `git sparse-checkout disable` to restore the other roadmaps hidden in step 3 (`references/sync-and-isolate.md` section C), if isolation was applied.
8. Tell the user what got checked off and what got deleted.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Picking a checkpoint without checking its `(depends: ...)` tag first | Only offer checkpoints that are actually ready (all dependency ids `closed`); ask via `AskUserQuestion` when more than one is ready |
| Branching from a stale local default, or ignoring that the default branch moved | Always `git fetch` and run sync-and-isolate section A first; default-based work branches from `origin/<default>` |
| Cutting a stackable checkpoint from `origin/<default>` or the current branch | Base is the blocker PR's `headRef`; otherwise the blocker's code is missing from the branch |
| Guessing branch relation from the ticket's topic/description | Only the ticket-ID-substring-in-branch-name check counts |
| Deleting other roadmaps' folders in the work branch | Hide them with `git sparse-checkout` only — never a commit that removes them |
| Driving the stages by hand instead of through `task-flow` | Run `flow start --step-dir …` and follow the `task-flow` skill |
| Leaving a fully-checked roadmap file in place | Delete it (and the empty folder) once the last checkbox is ticked |
| Committing the checkbox/deletion changes automatically | Never — explicit request only |
| Deleting the whole `steps/<step-slug>/` folder (design included) on checkpoint close-out | Delete only the plan file — the design stays as permanent history, same as the roadmap itself |
