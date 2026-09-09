# Verification Before Completion

**Required sub-skill:** invoke `superpowers:verification-before-completion` when claiming work is complete, fixed, or passing.

- Do not make that claim until the relevant commands have run in the current working tree.
- Use the project's affected-unit runner, scoped to the touched app/package, rather than an unrelated generic command.
- Report explicitly: checks run, result, and remaining risks. State every skipped or failed check and why.
