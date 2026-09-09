# MCP / Dedicated-Tool Priority

- If a file path is known, use `Read` or the project's designated file MCP tool; do not read it through `Bash cat`, `rtk read`, or a shell loop.
- If a rule names an MCP tool, call it directly; never proxy or emulate it through a terminal command.
- If the designated MCP is missing/disabled, say so and offer the fallback. A transient connection error is different: retry or report it without suggesting installation.
- Use Bash for unknown-file discovery, binary files, or pipelines that `Read`/MCP cannot express. A clean no-match verification needs no echoed exit code.
- Check whether the cwd is inside a git worktree before choosing a project MCP tool. Inside a worktree, use `Read` until path resolution is confirmed; a project MCP may resolve against the main checkout.
- A project should have one designated priority MCP tool; resolve it from project instructions rather than assuming one.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `cat known/path/file.ts` | `Read` or designated file MCP |
| Shell loop over known files | Separate `Read` calls or MCP batching |
| Silent Bash fallback when MCP is unavailable | Report the capability and fallback explicitly |
| Treating a transient MCP error as missing installation | Retry/report the transient failure |
