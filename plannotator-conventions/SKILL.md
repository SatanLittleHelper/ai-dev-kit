---
name: plannotator-conventions
description: Use when a long-running Plannotator process (plan review, code review, or annotation) has been started or is being polled — the same triggering moment as the plannotator skill family.
---

# Plannotator Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke the relevant `plannotator`/`plannotator-*` skill for the actual review UI mechanics. This skill is a required layer on top: how to treat the long-running process while it's in flight, and what not to do around commits during a review.

## Rules

- **Plannotator can be used across tools** (not just this session) to review plans, changes, and visual artifacts.
- **Keep polling until a final result** — annotations, approval, an error, or an exit code. An empty response, no output, or a polling timeout is an intermediate state, not completion; keep polling.
- **Do not end the turn while an active Plannotator process hasn't returned a final result.**
- **After receiving annotations, process them before continuing** the surrounding work — don't set them aside.
- **No `git add`/`git commit`/PR creation as part of a review without a direct request from the user** — see `repo-workflow-conventions` for the general rule this instance follows.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Treating an empty poll response as "review is done" | Keep polling — empty ≠ finished |
| Ending the response while the review is still running | Keep the turn open until a final result arrives |
| Receiving annotations and moving on without addressing them | Process every annotation before continuing |
| Committing changes as part of wrapping up a review | Only commit if the user explicitly asks |
