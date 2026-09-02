# Executing Roadmap Checkpoints

Drives one roadmap checkpoint from "find it" to "check it off": locate the roadmap, pick the first unfinished checkpoint, branch correctly, agree on an implementation mode, then close out (checkbox + cleanup) once done.

**REQUIRED BACKGROUND:** `roadmap/SKILL.md` (file locations/naming used below, including the per-step `steps/<step-slug>/` folder). Implementation itself is delegated to `writing-prd`, `superpowers:writing-plans`, `superpowers:subagent-driven-development`/`superpowers:executing-plans`, `codex-implement`, or `superpowers:using-git-worktrees` — this reference sequences them, it doesn't replace them.

Use this reference when the user names a specific checkpoint/task and asks to take/start it. For a generic "continue the roadmap" request that doesn't specify implementation vs. documentation, use `references/resuming-work.md` first — it decides whether this reference or `references/batch-plan-validate.md` applies.

## Process

### 1. Find the roadmap

- User named a feature/roadmap → use `docs/<slug>/*-roadmap.md`.
- Otherwise glob `docs/*/*-roadmap.md`.
  - Exactly one match → use it.
  - Zero matches → tell the user no roadmap was found, stop.
  - Multiple matches → `AskUserQuestion`, one option per roadmap (label = feature slug), never guess.

### 2. Find the next checkpoint

Read the roadmap top to bottom and collect every unchecked `- [ ] <TICKET> <name>` line, in document order. For each one, check its `(depends: <id>...)` tag, if any, against `docs/<slug>/roadmap-state.json` (`roadmap/SKILL.md` → `## Dependencies`): it's **ready** if the tag is absent/empty or every listed id has `status: "closed"`; otherwise it's **blocked**. If `roadmap-state.json` doesn't exist for this roadmap, fall back to checking each dependency id's own checkbox directly in the roadmap markdown (`- [x]` = satisfied).

- No unchecked line exists → the roadmap is already fully done. Report this and ask whether to delete it now (see step 6); do not delete unasked when you didn't just finish the work yourself.
- Exactly one ready checkpoint → that's the next checkpoint.
- More than one ready checkpoint → they're safe to work in parallel. `AskUserQuestion`, one option per ready checkpoint (label = its id + short name), and let the user pick which to take now — never guess by document order once more than one checkpoint is actually ready.
- No ready checkpoint but unchecked lines remain → everything left is blocked on something not yet closed; report which checkpoints are blocked and what each is waiting on, then stop — don't silently wait or invent an order.
- Ticket is the literal placeholder `TBD` → tell the user this checkpoint has no real ticket yet and ask whether to create one (offer `jira-writer` or equivalent) or proceed ticket-less.

### 3. Branch

1. Get the current branch name.
2. Deterministic relation check: does the current branch name contain the checkpoint's ticket ID as a substring (case-insensitive)? That's the only signal used — don't infer relation from vibes/branch topic.
   - **Match** → create the new work branch from the **current** branch. Still create a distinct new branch; never keep working directly on the branch you branched from.
   - **No match** → `AskUserQuestion`: which branch to base the new one on.
3. Name the new branch per the repo's own branch-naming rules if documented (check `CLAUDE.md`/`AGENTS.md`/`.claude/rules`); otherwise default to the bare `<ticket>` (no slug/description suffix) and state the chosen name in your status update so the user can redirect before it's created.
4. Never commit directly to the base branch; never skip creating a new branch even when the current one is a match.

### 4. Agree on implementation mode

If `docs/<slug>/roadmap-state.json` exists (`roadmap/SKILL.md` → `## State File`), read this checkpoint's entry first — its `status`, `prdPath`, and `specPath` tell you what's already there without needing to probe the filesystem.

Before writing code, confirm this checkpoint has its own step folder `docs/<slug>/steps/<step-slug>/` (`roadmap/SKILL.md` naming; derive `<step-slug>` from the checkpoint's own heading — ask the user if it's ambiguous, don't silently invent one) containing:

- a step-level PRD (`writing-prd`) — write it first if missing,
- an implementation plan (`superpowers:writing-plans`) — write it after the PRD if missing. Once written, if `roadmap-state.json` exists, set this checkpoint's `status` to `"plan-drafted"` and `planPath` to the new file's path.

A design doc in that folder (from `brainstorming`, written at roadmap-authoring time) is optional and only present if the step needed its own architectural decision — carry it forward as-is, don't regenerate it. Skip the PRD/plan requirement only if the user explicitly says the checkpoint is trivial enough to go straight to code.

Then ask **one** `AskUserQuestion` call with two questions (never fold this into freeform prose):

- **Q1 — method:** inline (no subagents) / subagent-driven development (`rules/skills/subagent-driven-development.md`, or `rules/skills/executing-plans.md` if the plan already exists) / `codex-implement`.
- **Q2 — worktree:** yes (`using-git-worktrees`) / no.

### 5. Implement

Drive the chosen combination of skills/rules. This reference does not itself write code — it hands off to the mode chosen in step 4 and waits for that mode's own final verification to pass before moving on.

### 6. Close out the checkpoint

Only after the implementation's own final verification step has passed:

1. If `docs/<slug>/roadmap-state.json` exists, set this checkpoint's `status` to `"implemented"`.
2. Edit the roadmap file: flip this checkpoint's `- [ ]` to `- [x]`. Touch only this line.
3. Delete only the checkpoint's implementation plan file (`docs/<slug>/steps/<step-slug>/YYYY-MM-DD-<ticket>-<name>.md`) — it's a mechanical execution artifact, same as any other plan. Leave the step's PRD and design doc (if any) in that folder in place: like the roadmap itself, they're kept as permanent history, not deleted after implementation. If the plan was the only file in the step folder, delete the now-empty folder too.
4. If `roadmap-state.json` exists, set this checkpoint's `status` to `"closed"` and `planPath` to `null` (the plan file was just deleted in the previous step).
5. If that was the **last** remaining `- [ ]` in the roadmap, also delete the roadmap file itself, and the `docs/<slug>/` folder if it's now empty (this removes any remaining step PRDs/design docs — and `roadmap-state.json` itself — along with it, same as deleting a fully-shipped roadmap always has).
6. Do not `git add`/`git commit` any of this — commit only on explicit user request, same as everywhere else.
7. Tell the user what got checked off and what got deleted.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Picking a checkpoint without checking its `(depends: ...)` tag first | Only offer checkpoints that are actually ready (all dependency ids `closed`); ask via `AskUserQuestion` when more than one is ready |
| Guessing branch relation from the ticket's topic/description | Only the ticket-ID-substring-in-branch-name check counts |
| Asking the implementation-mode question as free prose | Always a single `AskUserQuestion` call, two questions (method, worktree) |
| Leaving a fully-checked roadmap file in place | Delete it (and the empty folder) once the last checkbox is ticked |
| Committing the checkbox/deletion changes automatically | Never — explicit request only |
| Starting implementation with no step-level PRD, only a plan | Write the PRD first (`writing-prd`), then the plan — both are required in `steps/<step-slug>/`, not just the plan |
| Deleting the whole `steps/<step-slug>/` folder (PRD + design included) on checkpoint close-out | Delete only the plan file — PRD/design stay as permanent history, same as the roadmap itself |
