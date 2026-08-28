---
name: codebase-domain-map
description: Use before any codebase search or exploration in a large or unfamiliar repository — finding where a feature/domain lives, locating a file, deciding which app/package owns some logic — before reaching for find/grep/Explore or a research subagent.
---

# Codebase Domain Map

## Overview

A repo-local, regeneratable snapshot of "what lives where" — three small files under `.claude/project-snapshot/` that give domain/folder-level orientation in one read, instead of re-deriving the module map with `find`/`grep` every time. Read it first; it narrows *where* to look, then use normal search tools *inside* that narrowed scope for the actual line-level answer.

**Applies to every repository you work in — not just ones where `.claude/project-snapshot/` already exists, and independent of whatever any single project's own CLAUDE.md/rules happen to say about a "project snapshot."** A project's own rules may instruct reading its own already-generated snapshot by that name — that project-local instruction is one instance of this general, portable technique, not the whole of it. This skill is a different, standing thing: it applies in *any* repository, including ones with no such rule at all. If the snapshot is missing in the current repo, the correct move is to generate it (Setup below), never to skip the technique because no project-local rule told you to use it here.

## Red Flags — Do Not Skip

| Thought | Reality |
|---|---|
| "This project has a rule about a 'project snapshot' for a different repo, so that concept doesn't apply here" | That rule and this skill are not the same thing — this skill is a portable technique usable in any repo, with or without a matching project rule. Don't let a same-sounding project rule stand in for checking whether this skill applies |
| "No `.claude/project-snapshot/` here, so I can't use this" | Missing means generate it, not skip it — that's what the bundled script is for |
| "This is someone else's/an unfamiliar repo, not mine" | Unfamiliar is exactly the case this technique is for — familiarity is not a prerequisite |
| "It's faster to just grep now" | The setup is a single script run; skipping it to grep blind is the slower path on anything past a handful of files, and it's the default a fresh agent reaches for anyway — that's the failure this skill exists to prevent |

**What it narrows and what it doesn't:** domain/app/folder granularity only — not line- or symbol-level results. After the snapshot points at a folder, still grep/read inside it for the actual content.

## When to Use

- Before `find`/`grep`/`Explore`/a research subagent, whenever the task is "find where X lives," "which app owns Y," "locate the file for Z."
- **Every dispatching agent, not just yourself:** when delegating codebase research to a subagent, read the snapshot yourself first and pass the narrowed domain/path straight into the subagent's prompt (e.g. "auth domain: backend — `apps/api/src/app/auth`, frontend — `apps/web/src/pages/auth`"). A subagent prompt that says "find the code for X" without pre-narrowing via the snapshot makes the subagent blindly re-derive the domain map you already had for free.
- Not needed for a single well-known file path, or a repo small enough to read `ls` output directly.

## Files

- `.claude/project-snapshot/overview.md` — per-project domain list and entry points, human-readable.
- `.claude/project-snapshot/domains.tsv` — flat `scope\ttype\tname\tpath` table; fastest to `grep` for a keyword across every project at once.
- `.claude/project-snapshot/files.txt` — full file listing, for when domain-level granularity isn't enough.

## Setup / Refresh

Generate or refresh via the bundled script — works for Nx-style (`apps/`+`libs/`), Go/Rust-style (`cmd/`, `internal/`, `crates/`), and flat repos alike; it auto-detects which container directories exist and falls back to top-level dirs otherwise:

```bash
bash <skill-dir>/scripts/update-project-snapshot.sh          # repo root = git toplevel (or cwd)
bash <skill-dir>/scripts/update-project-snapshot.sh /path/to/repo   # explicit root
```

Re-run it after adding new apps/packages/domains — **a stale snapshot missing a new domain is worse than no snapshot** (silent false negative: a search comes back "nothing here" instead of "wrong place to look"). Commit the generated files if the team shares the convention; keep them local otherwise.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Grepping the whole repo before checking the snapshot | Read `overview.md`/`grep domains.tsv` first — it's one file, not a search |
| Dispatching a research subagent with "find X" and no narrowed path | Read the snapshot yourself, pass the resolved domain/path into the subagent's prompt |
| Treating the snapshot as line-level search | It's folder-level only — still grep/read inside the narrowed folder for the real answer |
| Never regenerating after adding a new app/domain | Re-run the script — a stale snapshot produces false negatives, not just staleness |
