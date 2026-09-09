# Brainstorming Conventions

**Required sub-skill:** invoke `superpowers:brainstorming`; it owns the design process. This file adds repository-specific activation, Plan Mode, approval, and artifact rules.

## Trigger and flow

Use this for ideas, new behavior, architecture, or any request equivalent to «давай подумаем» / “let's think about this”. Enter native Plan Mode first. Explore project context, ask one question at a time, compare 2–3 approaches, present the design, and get approval before implementation.

After design approval, hand off to `rules/skills/writing-plans.md`; do not invoke `superpowers:writing-plans` directly. Do not implement before the design is agreed when the task requires an architectural choice.

## Plan Mode and artifacts

- Every Plan Mode turn ends with `ExitPlanMode` or `AskUserQuestion`; do not ask plain-text questions while it is active.
- Each document has its own approval cycle. Do not append a new draft to an already-approved Plan Mode file.
- Save the design spec only after approval, at `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
- If a plan follows, delete the temporary design spec unless the user asks to keep it.
- If the user explicitly requests visual annotation, save the current design and use the annotation UI; otherwise use text.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Implementing before design approval | Finish brainstorming and approval first |
| Skipping Plan Mode | Enter it before invoking the sub-skill |
| Saving the spec early | Keep the draft in chat/Plan Mode until approval |
| Combining approval cycles | Use one Plan Mode document per artifact |
