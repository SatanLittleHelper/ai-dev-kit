---
name: verification-before-completion-conventions
description: Use when about to claim work is complete, fixed, or passing checks — the same triggering moment as superpowers:verification-before-completion.
---

# Verification Before Completion Conventions

## Overview

**REQUIRED SUB-SKILL:** Invoke `superpowers:verification-before-completion` — it owns the "evidence before assertions" discipline itself. This skill adds one structural requirement for how the result gets reported.

## Rules

- **Never claim work is complete, fixed, or passing checks until the corresponding commands have actually been run** in the current working tree — not "should pass," not "this looks right."
- **Verify through the project's own affected-unit runner** (e.g. its build/test task runner, scoped to the specific app/package touched) rather than a generic "run everything" command.
- **End the report with three explicit parts:** which checks were run, their result, and any remaining risks — every time, not just when something failed.
- **If a check wasn't run or failed, say so explicitly** — don't omit it or soften it into "should be fine."

## Common Mistakes

| Mistake | Fix |
|---|---|
| "This should work now" with no command actually run | Run the check, then report the actual result |
| Reporting only "tests passed" with no mention of what wasn't checked | Always state checks-run / result / remaining-risks, all three |
| Silently skipping a check that failed or couldn't run | State explicitly that it wasn't run or failed, and why |
