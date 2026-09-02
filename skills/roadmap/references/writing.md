# Writing Roadmaps

**REQUIRED BACKGROUND:** `superpowers:brainstorming` — this reference reuses its dialogue discipline (one question at a time, propose 2-3 approaches, incremental section-by-section approval) and its native-Plan-Mode requirement. Read it first; this reference only covers what's different for a multi-step decomposition. Storage/naming (where the roadmap, the feature-level PRD, and each step's own PRD/spec/plan live) is governed by `roadmap/SKILL.md` — read it before writing anything to disk.

## When to Use

- User explicitly says "roadmap" / "дорожная карта", or describes a task spanning multiple releases/weeks/independent deployable chunks.
- The work has a target end-state, but getting there safely requires an ordered sequence of intermediate states, each one shippable on its own.

**Not for:** a task that fits one spec+plan cycle, even a large one — if there's no requirement that intermediate states be independently shippable, it's not a roadmap, it's a big plan. Use `brainstorming` → `writing-plans` directly.

## Core Principle: Every Step Must Leave the App Working

The one rule a roadmap adds on top of an ordinary decomposition: **after any single step merges, the app builds and runs — no broken imports, no half-migrated types, no dangling references.** This is what separates a roadmap step from an arbitrary chunk of a big diff. When ordering steps, ask "if we shipped only steps 1..N and stopped here, is the app in a valid state?" for every prefix. If the honest answer is no, steps are cut wrong — merge them or reorder, don't ship a broken intermediate.

Concretely this usually means: additive changes (new module, new table, dual-write) before destructive ones (removing the old path), and "read path still works during the transition" before "write path switches over."

## Process

1. **Native Plan Mode required**, same as `brainstorming`/`writing-plans` — enter it before starting.
2. Explore project context; look for existing roadmap documents in the project to match its established structure/location convention (a project's own rules — including any personal/local override file — take precedence over the defaults below).
3. The **feature-level PRD** is written after the roadmap, not before: don't look for it or write it yet at this step. Once the roadmap decomposition is approved (step 7) and saved (step 8), write the feature-level PRD (`roadmap/SKILL.md`, format per `writing-prd`) at `docs/<feature-slug>/YYYY-MM-DD-<feature-slug>-prd.md`, based on the now-decided roadmap — a roadmap is never finalized without a linked feature-level PRD, but the PRD documents that decision rather than preceding it.
4. Ask clarifying questions **one at a time** (current state, target state, hard constraints, whether releases have fixed dates or are just logical checkpoints) — same discipline as `brainstorming`.
5. Propose the **target-state architecture** (2-3 approaches, lead with a recommendation) — this is the end-state design, not the step-by-step path yet.
6. Decompose into steps, applying the Core Principle above. For each step, decide:
   - **Flat entry vs. nested step folder:** a step simple enough to state in a few lines stays a checklist item directly in the roadmap; a step carrying its own architectural decisions gets its own folder `docs/<feature-slug>/steps/<step-slug>/` holding that step's design doc (`brainstorming`) and, once worked, its own PRD and implementation plan (`roadmap/SKILL.md` naming). Don't default to nesting everything — most steps should be flat until they're actually picked up.
   - **Ticket granularity:** one ticket per checkpoint, or several tightly-coupled checkpoints grouped under one ticket — decide per step based on how independently each checkpoint is actually worth tracking; annotate the choice inline (`Jira: TBD` per checkpoint, or one `Jira: TBD` for the group) so the reader sees the grouping, not just guesses it.
   - **Dependencies:** for each checkpoint, decide which other checkpoint ids **in this same roadmap** must be closed before it can start, and tag it `(depends: <id>[, <id>...])` at the end of its checklist line (`roadmap/SKILL.md` → `## Dependencies`); omit the tag when there's no internal dependency. Don't mark every checkpoint as depending on the one before it "to be safe" — that defeats the point, which is showing which checkpoints can actually be worked in parallel.
7. Present the decomposition → `ExitPlanMode` for design approval (same gate as `brainstorming`).
8. Write the roadmap (+ any nested step folders) to disk. **Default location:** a dedicated `docs/<feature-slug>/` folder, committed to git and kept permanently — a roadmap is a durable record of a migration's history, not a throwaway planning artifact, so it does not follow the usual "delete the plan/spec after implementation" rule. A project's own conventions (including a personal `.local.md` override) win over this default when they conflict for the roadmap and feature-level PRD themselves — but not for individual steps' own artifacts once a step is worked, see `roadmap/SKILL.md` → `## Storage Precedence`. Then write the feature-level PRD, based on the roadmap just saved, and add its link into the roadmap's `Context` section. Then create `docs/<feature-slug>/roadmap-state.json` per `roadmap/SKILL.md` → `## State File`: one entry per checkpoint, `status: "not-started"`, `stepFolder` filled in only for checkpoints that got a folder immediately, and `dependsOn` populated straight from each checkpoint's `(depends: ...)` tag (`roadmap/SKILL.md` → `## Dependencies`; empty array when the tag is absent).
9. Self-review pass (placeholders, internal contradictions, the Core Principle check on step ordering, ambiguous checkpoints, roadmap actually links to the feature-level PRD) — fix inline, no separate round.
10. Ask the user to review the written roadmap and PRD before proceeding.
11. After approval, ask (`AskUserQuestion`, don't auto-start) how to continue. Offer, alongside "just save it for later": **running ticket-drafting and plan-drafting in parallel** — a Jira-drafting skill (e.g. `jira-writer`) producing one paste-ready draft per ticket, and `references/batch-plan-validate.md` drafting/validating each checkpoint's implementation plan — both fed from the same roadmap checklist. Note explicitly that a Jira-drafting skill typically only *drafts* text for the user to paste into Jira's UI; it does not create tickets via API, so real ticket IDs come back from the user afterward and replace the `TBD` placeholders in the roadmap doc.

## Roadmap Document Template

```markdown
# Роадмап: <feature>

## Context
Problem, current state, target state, why this needs decomposition (not just a big plan).
ПРД: docs/<feature-slug>/<date>-<feature-slug>-prd.md   <- required link to the feature-level PRD

## Архитектура (целевая)
End-state architecture — not per-step.

## Шаги                                    <- use this section for a two-level roadmap
### Шаг A — <name>
Папка шага: docs/<feature-slug>/steps/<step-slug>/   <- only if step A got its own folder (design/PRD/plan)
- [ ] A1 — ... (Jira: TBD / real ticket id)
- [ ] A2 — ... (Jira: TBD) (depends: A1)   <- optional tag, only when A2 truly needs A1 closed first

## Список задач                            <- use this instead of Шаги for a flat roadmap
- [ ] <ticket-or-TBD> — [domain] Title — what changes, dependencies

## Сквозные риски                          <- optional, mainly useful for the two-level form
Cross-cutting risks that span more than one step (per-step risks live in that step's own folder).

## Verification
A roadmap carries no code — verification happens per-checkpoint, in that checkpoint's own implementation plan.
```

## Quick Reference

| Decision | Rule |
|---|---|
| Roadmap vs. big plan | Roadmap only if intermediate states must independently ship |
| Step ordering | Every prefix of shipped steps must leave the app working |
| Feature-level PRD | Written after the roadmap is approved/saved, based on it — `docs/<feature-slug>/<date>-<feature-slug>-prd.md`, roadmap links to it |
| Flat item vs. nested step folder | Nest (`docs/<feature-slug>/steps/<step-slug>/`) only when the step needs its own architectural decision; its own PRD/plan get added there once the step is picked up |
| Ticket granularity | Per-step judgment call, annotated inline, not silently assumed |
| Dependencies | `(depends: <id>...)` only when truly needed — lets `references/executing-checkpoints.md` offer parallel checkpoints instead of forcing document order |
| Save location | `docs/<feature-slug>/`, committed, kept permanently (unless project overrides) |
| After approval | Ask before starting ticket-drafting/plan-drafting — never auto-start |

## Common Mistakes

- **Writing the whole roadmap as one big spec with headings instead of checkable steps.** Loses the progress-tracking purpose — every step needs its own `- [ ]`.
- **Cutting a step so the app breaks between merges** (e.g. removing the old code path before the new one is proven) — violates the Core Principle; reorder or merge the steps instead.
- **Batch-asking all clarifying questions in one message.** Breaks the `brainstorming` dialogue discipline this reference inherits — one question at a time.
- **Finalizing the roadmap with no linked feature-level PRD.** `roadmap/SKILL.md` requires one — write it with `writing-prd` right after the roadmap is saved, don't skip it because the roadmap "already explains the problem."
- **Nesting every step into its own folder "to be safe."** Most steps are simple enough to stay a flat checklist line; over-nesting produces a pile of near-empty step folders nobody reads.
- **Inventing Jira ticket numbers.** A ticket-drafting skill produces text to paste, not a created ticket — use `TBD` until the user reports back a real id.
- **Deleting the roadmap folder after the migration finishes.** Unlike an ordinary plan/spec, this is meant to stay as history — don't apply the usual "clean up after implementation" reflex to it.
- **Auto-starting ticket/plan drafting right after `ExitPlanMode` approval.** Design approval isn't "start coding" — ask how to proceed, same reasoning as after any other Plan Mode exit.
- **Tagging every checkpoint as depending on the previous one "to be safe."** Defeats the purpose of `(depends: ...)` — only tag a real dependency; checkpoints with no real dependency should be tag-free so `references/executing-checkpoints.md` can actually offer them in parallel.
