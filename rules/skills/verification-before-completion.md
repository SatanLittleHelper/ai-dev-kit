# Verification Before Completion

**Required sub-skill:** invoke `superpowers:verification-before-completion` when claiming work is complete, fixed, or passing.

- Do not make that claim until the relevant commands have run in the current working tree.
- Use the project's affected-unit runner, scoped to the touched app/package, rather than an unrelated generic command.
- If the project defines a `test-e2e` target for a touched layer (backend app, frontend app), also run it before claiming completion — only for the touched projects, not the whole workspace. Skip it only when the change cannot affect that layer or its prerequisites (Docker, installed Playwright browsers) are unavailable; state the skip and the reason in the report.
- Report explicitly: checks run, result, and remaining risks. State every skipped or failed check and why.
