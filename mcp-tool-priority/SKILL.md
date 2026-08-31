---
name: mcp-tool-priority
description: Use when a dedicated MCP tool or the built-in Read tool could handle a task that Bash could also do — reading a known file path, or any operation a project's rules say to route through a specific MCP server.
---

# MCP / Dedicated-Tool Priority

## Overview

Two related defaults for a session with MCP servers or dedicated file tools available: prefer the dedicated tool over a raw shell command, and when the dedicated tool is supposed to be there but isn't working, say so instead of silently downgrading.

## Quick Reference

| Situation | Rule |
|---|---|
| Reading a file whose path is already known | `Read` (or the project's designated MCP file tool) — never `Bash cat`/`rtk read`/a shell loop over known paths |
| A rule says to use a specific MCP tool (WebStorm, Context7, a DB client, etc.) | Use it directly through the MCP tool call — not via a terminal command that launches/proxies/emulates it |
| That MCP tool is not installed, not connected, or disabled | Say so and suggest installing/connecting/enabling it — don't silently fall back to a non-MCP alternative without mentioning the option exists |
| That MCP tool returns a transient connection error (not "missing") | Fall back without suggesting installation — this is an environment blip, not an absent capability |
| A verification `grep`/Bash command with no matches (expected clean result) | Just read the output — don't append `; echo "exit:$?"` or similar; a `grep` exit code of 1 for "no matches" isn't a meaningful signal here |

## Never Read a Known Path Through Bash

If you already have a file's path, use `Read` (or a project's dedicated MCP read tool, when one is designated) — never `cat`, `rtk read`, or a shell loop wrapping either. This applies to every agent in a session, not just the top-level one: implementer/reviewer subagents, and research/planning agents alike.

A Bash `for`-loop over several known paths piping into `cat` is the worst-case version of this mistake: it bundles multiple file reads into one compound shell command, which is both slower to review and provides no benefit over calling the dedicated tool once per path.

**Reserve Bash for what `Read`/MCP genuinely can't express:** an unknown file set that needs `find`/`grep` to locate first, binary files, or an actual shell/text-processing pipeline. Locating an unknown file is a `find`/`grep` job; reading a file whose path you already have is not.

## Missing/Disabled MCP ≠ Transient Error

When a project's own rules say a specific MCP tool should be used for some operation, and that tool isn't installed, isn't connected, or is disabled for the current user — proactively suggest installing/connecting/enabling it before defaulting to a non-MCP alternative. Don't just switch tools silently; the person working with you may not know the option exists at all.

A **transient connectivity error** (a one-off "session not found," a dropped connection) is a different case: that's an environment blip, not an absent capability, so fall back without the installation suggestion — retrying or reporting the blip is enough.

**MCP tools are called directly through the MCP interface, never proxied.** Using a terminal command, a new shell session, or a wrapper script to launch/emulate what an MCP tool already does is forbidden — if direct MCP access isn't available in the current context (e.g. a subagent that doesn't have it), report that rather than working around it with a shell command that only approximates the MCP tool's behavior.

## One Designated Tool Per Project

A project typically designates one IDE/editor's MCP server as its priority tool (this developer's usual choice: WebStorm MCP) — check the project's own instructions for which one, if any, is configured before assuming none is. When a rule says "use MCP" without naming a specific server, it means that project's designated one.

## Worktree-vs-Main Check Comes First

Before choosing between a dedicated MCP read tool and `Read` for a session's first file read — or right after discovering the session runs inside a git worktree — check whether the working directory is actually inside the worktree path (`pwd`/cwd), not deferred to whenever the MCP-vs-Read question happens to come up. Inside a worktree, a project's designated MCP tool commonly resolves paths against the *main* checkout and silently returns stale content instead of the worktree's own — so default to `Read` only, never the MCP tool, until the environment confirms otherwise. This is a pre-flight check, done once, not a per-file judgment call.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `cat known/path/file.ts` when the path is already known | `Read` (or the designated MCP file-read tool) |
| A `for f in a.md b.md c.md; do cat $f; done` loop | One `Read` call per file, or a single MCP call if the tool supports batching |
| An MCP tool is disabled and the agent quietly uses Bash instead | Say the MCP tool is unavailable, suggest enabling it, offer the Bash fallback as a fallback — not a silent default |
| Treating a transient MCP connection error as "not installed" | Just retry/report the blip — don't suggest installation for a one-off error |
| `grep -n "pattern" file; echo "exit:$?"` in a leftover-reference check | Drop the exit-code echo — a clean `grep` returning nothing already says what's needed |
| Using the designated MCP tool for reads inside a git worktree | `Read` only, until confirmed the tool resolves worktree paths correctly |
