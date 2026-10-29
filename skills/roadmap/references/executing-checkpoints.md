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
- Exactly one ready checkpoint → that's the next checkpoint.
- More than one ready checkpoint → they're safe to work in parallel. `AskUserQuestion`, one option per ready checkpoint (label = its id + short name), and let the user pick which to take now — never guess by document order once more than one checkpoint is actually ready.
- No ready checkpoint but unchecked lines remain → everything left is blocked on something not yet closed; report which checkpoints are blocked and what each is waiting on, then stop — don't silently wait or invent an order.
- Ticket is the literal placeholder `TBD` → tell the user this checkpoint has no real ticket yet and ask whether to create one (offer `jira-writer` or equivalent) or proceed ticket-less.

### 3. Branch

1. Working tree must be clean; if not, tell the user and stop — don't stash or discard anything.
2. Get the current branch name. Deterministic relation check: does it contain the checkpoint's ticket ID as a substring (case-insensitive)? That's the only signal — don't infer relation from vibes/branch topic.
   - **Match** (stacked work) → the new branch is cut from the **current** branch, after its gap with `origin/<default>` was handled in `references/sync-and-isolate.md` section A. Still a distinct new branch; never keep working on the branch you branched from.
   - **No match** → `AskUserQuestion`: which branch to base the new one on, with `origin/<default>` as the recommended first option.
3. If the base is the default branch, `git fetch origin` and cut from `origin/<default>` (`git switch -c <name> --no-track origin/<default>`), never from a stale local copy.
4. Name the new branch per the repo's own branch-naming rules if documented (check `CLAUDE.md`/`AGENTS.md`/`.claude/rules`); otherwise default to the bare `<ticket>` (no slug/description suffix) and state the chosen name in your status update so the user can redirect before it's created.
5. Never commit directly to the base branch.
6. Isolate the branch: run `references/sync-and-isolate.md` section C so only this roadmap's `docs/<slug>/` remains in the working tree.

### 4. Agree on implementation mode

If `docs/<slug>/roadmap-state.json` exists (`roadmap/SKILL.md` → `## State File`), read this checkpoint's entry first — its `status` and `specPath` tell you what's already there without needing to probe the filesystem.

Before writing code, confirm this checkpoint has its own step folder `docs/<slug>/steps/<step-slug>/` (`roadmap/SKILL.md` naming; derive `<step-slug>` from the checkpoint's own heading — ask the user if it's ambiguous, don't silently invent one) containing an implementation plan (`superpowers:writing-plans`) — write it if missing, using the step's design doc as input when one exists. Once written, if `roadmap-state.json` exists, set this checkpoint's `status` to `"plan-drafted"` and `planPath` to the new file's path.

A design doc in that folder (from `brainstorming`, written at roadmap-authoring time) is optional and only present if the step needed its own architectural decision — carry it forward as-is, don't regenerate it. Skip the plan requirement only if the user explicitly says the checkpoint is trivial enough to go straight to code.

Then ask **one** `AskUserQuestion` call to decide the method (never fold this into freeform prose):

- **method:** inline (no subagents) / subagent-driven development (`rules/skills/subagent-driven-development.md`, or `rules/skills/executing-plans.md` if the plan already exists) / `codex-implement`.

### 5. Implement

Drive the chosen combination of skills/rules. This reference does not itself write code — it hands off to the mode chosen in step 4 and waits for that mode's own final verification to pass before moving on.

### 6. Close out the checkpoint

Only after the implementation's own final verification step has passed:

1. If `docs/<slug>/roadmap-state.json` exists, set this checkpoint's `status` to `"implemented"`.
2. Edit the roadmap file: flip this checkpoint's `- [ ]` to `- [x]`. Touch only this line.
3. Delete only the checkpoint's implementation plan file (`docs/<slug>/steps/<step-slug>/YYYY-MM-DD-<ticket>-<name>.md`) — it's a mechanical execution artifact, same as any other plan. Leave the step's design doc (if any) in that folder in place: like the roadmap itself, they're kept as permanent history, not deleted after implementation. If the plan was the only file in the step folder, delete the now-empty folder too.
4. If `roadmap-state.json` exists, set this checkpoint's `status` to `"closed"` and `planPath` to `null` (the plan file was just deleted in the previous step).
5. If that was the **last** remaining `- [ ]` in the roadmap, also delete the roadmap file itself, and the `docs/<slug>/` folder if it's now empty (this removes any remaining step design docs — and `roadmap-state.json` itself — along with it, same as deleting a fully-shipped roadmap always has).
6. Do not `git add`/`git commit` any of this — commit only on explicit user request, same as everywhere else.
7. Run `git sparse-checkout disable` to restore the other roadmaps hidden in step 3 (`references/sync-and-isolate.md` section C), if isolation was applied.
8. Tell the user what got checked off and what got deleted.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Picking a checkpoint without checking its `(depends: ...)` tag first | Only offer checkpoints that are actually ready (all dependency ids `closed`); ask via `AskUserQuestion` when more than one is ready |
| Branching from a stale local default, or ignoring that the default branch moved | Always `git fetch` and run sync-and-isolate section A first; default-based work branches from `origin/<default>` |
| Guessing branch relation from the ticket's topic/description | Only the ticket-ID-substring-in-branch-name check counts |
| Deleting other roadmaps' folders in the work branch | Hide them with `git sparse-checkout` only — never a commit that removes them |
| Asking the implementation-mode question as free prose | Always a single `AskUserQuestion` call for the method |
| Leaving a fully-checked roadmap file in place | Delete it (and the empty folder) once the last checkbox is ticked |
| Committing the checkbox/deletion changes automatically | Never — explicit request only |
| Deleting the whole `steps/<step-slug>/` folder (design included) on checkpoint close-out | Delete only the plan file — the design stays as permanent history, same as the roadmap itself |
