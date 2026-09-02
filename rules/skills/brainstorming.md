# Brainstorming Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke `superpowers:brainstorming` — it owns the actual design process (spike/bounded/architectural classification, clarifying questions, approaches). This file is a required pre/post layer around it: native Plan Mode wiring, trigger-phrase recognition, and where the resulting spec lives.

## Trigger Phrases

An invitation to jointly think through an architectural/creative decision — in whatever language this developer communicates in (this developer's own trigger: «давай подумаем» / "let's think about this", «подумаем над этим» / "let's brainstorm this") — is a direct trigger to launch `superpowers:brainstorming` immediately, not a reason to answer with a short inline opinion in exploratory-question format. Keep the literal phrase in its original language alongside an English duplicate, since matching happens against real user input in that language, not its translation.

## Plan Mode Wiring

- Enter native Plan Mode **before** invoking `superpowers:brainstorming` — not after.
- Native Plan Mode's turn-ending rule applies throughout, including the design-writing steps: every turn while Plan Mode is active ends with `ExitPlanMode` or `AskUserQuestion` — never a plain-text question or statement asked as chat prose without one of those two tools.
- Once the design is approved conversationally, call `ExitPlanMode` to trigger the review gate — a plain-text confirmation doesn't substitute for it.
- **Each document on its own approval cycle.** If a single task produces several separate documents for approval in sequence (a design spec, then an implementation plan), each gets its own independent `EnterPlanMode` → draft → `ExitPlanMode` → save cycle. Don't append the next document to the same Plan Mode service file that still holds an already-approved one — the approval UI shows the whole file, and the already-approved document would be shown for "re-approval." Before starting the next document, make sure the service file holds only its draft.

## Spec Placement

Do not write the design spec to its permanent location before `ExitPlanMode` approval — draft/present it in chat and in Plan Mode's own service file first. Only after approval, save it to `superpowers:brainstorming`'s own default location (`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`) — `rules/base/artifacts-and-tmp.md` explicitly leaves this to the planning skill's default rather than overriding it. After the plan is written and saved, delete the temporary design spec unless the user explicitly asked to keep it.

## Review Companion

When the user explicitly asks to see the design/architecture through a visual annotation tool (so they can leave inline comments) — invoke that tool on the design content instead of, or in addition to, presenting it as chat prose: save the current design section(s) to a file first if not already saved, open it in the annotation UI, and act on the returned annotations before continuing. This is explicit-request-only, never auto-triggered by reaching the design-presentation step.

## Handoff

After the design is approved, hand off to `rules/skills/writing-plans.md` (which itself requires `superpowers:writing-plans`) — not `superpowers:writing-plans` directly. Do not start implementation before the design is agreed on, when the task genuinely requires an architectural choice.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Answering a "let's think about this" invitation with a short inline opinion | Launch `superpowers:brainstorming` (with Plan Mode) instead |
| A plain-text question asked mid-brainstorm while Plan Mode is active | `AskUserQuestion` or `ExitPlanMode` — never bare chat prose |
| Saving the design spec before `ExitPlanMode` approval | Draft only in chat/Plan Mode's service file until approved |
| Appending a second document's draft to a Plan Mode file that still holds an approved first document | Clear/recreate the service file before starting the next document |
| Leaving the design spec in the repo after the plan is saved | Delete it once the plan exists, unless asked to keep it |
