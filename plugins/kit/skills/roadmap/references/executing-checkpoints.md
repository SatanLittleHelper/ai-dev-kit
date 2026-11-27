# Executing Roadmap Checkpoints

Drives one roadmap checkpoint from "find it" to "check it off": locate the roadmap, pick the first unfinished checkpoint, branch correctly, agree on an implementation mode, then close out (checkbox + cleanup) once done.

**REQUIRED BACKGROUND:** `roadmap/SKILL.md` (file locations/naming used below, including the per-step `steps/<step-slug>/` folder). Implementation itself is delegated to `superpowers:writing-plans`, `superpowers:subagent-driven-development`/`superpowers:executing-plans`, or `codex-implement` — this reference sequences them, it doesn't replace them.

Use this reference when the user names a specific checkpoint/task and asks to take/start it. For a generic "continue the roadmap" request that doesn't specify implementation vs. documentation, use `references/resuming-work.md` first — it decides whether this reference or `references/batch-plan-validate.md` applies.

## Process

### 0–3. Select and pick a checkpoint

Run `node <base>/../../tools/roadmap/cli/main.mts status`. Ask the user when several steps are ready. Run `node <base>/../../tools/roadmap/cli/main.mts pick <id>`; ask about `needs-input` and repeat with `--base`, `--sync` or `--step-slug` as appropriate. Execute the printed `flow start` command. For `Jira: TBD`, see `references/jira-tickets.md`, or use `jira-writer` for one issue with `create --parent <story-key>`.

### 4. Hand over to task-flow

From here the checkpoint is a task. Execute the `flow start` command printed by `roadmap pick` and follow the `task-flow` skill.

```
node <base>/../../tools/flow/cli/main.mts start <id> --step-dir docs/<slug>/steps/<step-slug> [--no-tracker]
```

- `<id>` is the checkpoint's real ticket key, or the checkpoint id (`A1`, `F2`) while its ticket is `TBD`; add `--no-tracker` when `<id>` is not a Jira key. `<step-slug>` comes from the checkpoint's own heading — ask the user if it is ambiguous, never invent one silently.
- Existing approved documents are registered, not rewritten: if the step's `status` is `spec-validated` and `specPath` exists, run `flow skip spec --reason "approved: <specPath>"`; if it is `plan-drafted` (the documents were approved earlier, a saved file is the proof), do the same for `spec`, then `flow skip test-plan --reason "approved: <testPlanPath>"` when `testPlanPath` is set (otherwise `combined: …`) and `flow skip plan --reason "approved: <planPath>"`, and continue from the method question. The registered file's path and hash become the stage's evidence, so a later edit resets the stages. A `spec-drafted` design is not an approval: write the spec through the flow instead. A step that is `implemented` goes straight to close-out.
- The flow then carries the order: spec, test plan (skipped as `combined` for a single-task plan), plan, the method question and implementation, simplify, check, local test, review, PR. It runs the document approvals and keeps this checkpoint's entry in `roadmap-state.json` up to date: `stepFolder`, `specPath`, `testPlanPath`, `planPath` and `status` up to `implemented`; it never lowers a status and never touches a `closed` step.
- Once the plan is written, re-check the step's estimate against it (`roadmap/SKILL.md` → `## Estimates`): update `estimate` (+ `basis: "plan-drafted"`) and the `(est: ...)` tag, run `node <base>/../../tools/roadmap/cli/main.mts estimate` to recompute the roadmap. If `manual.max` now exceeds 3д, tell the user the step should be split before implementing.
- A design doc in the step folder (from `brainstorming`, written at roadmap-authoring time) is carried forward as-is, never regenerated. Skip the plan requirement only if the user explicitly says the checkpoint is trivial enough to go straight to code.

### 5. Let the flow finish the work

Do not drive the stages by hand here: `flow status` shows where the checkpoint is, and the `task-flow` skill says what to do next. The checkpoint is ready for close-out when the `review` stage is closed and the flow is at `pr`.

### 6. Close out the checkpoint

Run `node <base>/../../tools/roadmap/cli/main.mts close <id>`. If it asks for days, ask the user and repeat with `--days`. After revising an estimate in the state and tag, run `node <base>/../../tools/roadmap/cli/main.mts estimate`.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Picking a checkpoint without checking its `(depends: ...)` tag first | Only offer checkpoints that are actually ready (all dependency ids `closed`); ask via `AskUserQuestion` when more than one is ready |
| Branching from a stale local default, or ignoring that the default branch moved | Run `roadmap status` and use `roadmap pick` to select the base |
| Cutting a stackable checkpoint from `origin/<default>` or the current branch | Base is the blocker PR's `headRef`; otherwise the blocker's code is missing from the branch |
| Guessing branch relation from the ticket's topic/description | Only the ticket-ID-substring-in-branch-name check counts |
| Deleting other roadmaps' folders in the work branch | Use `roadmap pick` for isolation; never commit removals |
| Driving the stages by hand instead of through `task-flow` | Run `flow start --step-dir …` and follow the `task-flow` skill |
| Leaving a fully-checked roadmap file in place | Delete it (and the empty folder) once the last checkbox is ticked |
| Committing the checkbox/deletion changes automatically | Never — explicit request only |
| Deleting the whole `steps/<step-slug>/` folder (design included) on checkpoint close-out | Delete only the plan file — the design stays as permanent history, same as the roadmap itself |
