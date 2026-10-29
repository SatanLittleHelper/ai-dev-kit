# Fresh Main, PR Sync, Branch Isolation

Three shared procedures every other roadmap reference calls into: check the default branch for changes, overlay the state of roadmap work already in open PRs, and — once a checkpoint is picked — strip other roadmaps from the working tree. Does no drafting or implementation itself.

**REQUIRED BACKGROUND:** `roadmap/SKILL.md` (file locations, `roadmap-state.json` schema, `## Dependencies`).

## A. Check what changed in the default branch (before reading any roadmap data)

Roadmap files on a stale checkout lie: checkboxes and `roadmap-state.json` change on the default branch every time a checkpoint PR merges. Work happens in one of two situations — from the default branch, or from a branch that belongs to a roadmap (stacked work) — and in **both** the first thing to establish is whether the default branch moved.

1. `git fetch origin --prune`. Default branch = `git symbolic-ref --short refs/remotes/origin/HEAD` minus the `origin/` prefix; never hardcode `main`.
2. Measure the gap: `git rev-list --count HEAD..origin/<default>` (commits missing here) and `git diff --stat HEAD...origin/<default> -- docs/` (roadmap files that changed there). Report both in one line.
3. Actualize, depending on where the checkout is:
   - **On the default branch, clean tree** → `git merge --ff-only origin/<default>`.
   - **On a roadmap-related branch** (its name contains a ticket ID of a checkpoint from some roadmap, case-insensitive — same deterministic check as `references/executing-checkpoints.md` step 3) and it is behind → `AskUserQuestion`: merge `origin/<default>` into it / rebase onto it / continue without updating. Never update silently, never rewrite history unasked. Not behind → nothing to do.
   - **Any other branch, or a dirty tree** → change nothing.
4. Whatever the user picks, all roadmap data used for decisions (checkboxes, statuses, dependencies, what is ready) is read from `origin/<default>` via `git show origin/<default>:docs/<slug>/...` (list with `git ls-tree -r --name-only origin/<default> docs/`) whenever the local copy is behind it, then overlaid by section B. If the local copy was left behind, say so once.
5. Never answer "what's next" from a local roadmap file that hasn't been compared with `origin/<default>`.

## B. Sync with in-flight PRs (read-only overlay)

Main only knows a checkpoint's progress after its PR merges; steps being worked on in open PRs look untouched. Overlay them before deciding anything.

1. List open PRs with their changed files. Pick the tool by the host in `git remote get-url origin`:
   - **GitHub** (`github.com`): `gh pr list --state open --limit 100 --json number,title,headRefName,url,files`.
   - **Forgejo/Gitea** (any other host; `gh` does not work there): use the REST API with a token from the env var `FORGEJO_TOKEN` (or `GITEA_TOKEN`); never print or commit it. Build the base from the remote — `ssh://git@host:2222/owner/repo.git` or `git@host:owner/repo.git` → `https://host/api/v1/repos/owner/repo`. List with `curl -s -H "Authorization: token $FORGEJO_TOKEN" "<base>/pulls?state=open&limit=50"` (fields `number`, `title`, `head.ref`, `html_url`; follow `page=` until a page comes back empty), then per PR `curl -s -H "Authorization: token $FORGEJO_TOKEN" "<base>/pulls/<N>/files?limit=50"` (field `filename`, paginate the same way). Read-only: never POST/PATCH/DELETE through the API from here.
2. Keep only PRs whose `files` include a path matching `docs/*/roadmap-state.json`. PRs that don't touch a state file are not roadmap work — ignore them (no branch/title guessing).
3. For each kept PR, `git fetch origin <headRefName>`, then compare, per touched `<slug>`, `git show origin/<headRefName>:docs/<slug>/roadmap-state.json` against the default-branch version. Every step whose `status`, `specPath` or `planPath` differs is **in-flight in PR #N** at the PR's status. A state file or step that exists only in the PR is a new roadmap/step in flight.
4. Treat the result as an overlay on the main data, per step:
   - **In-flight steps are not "ready to pick up"** — never offer them as the next checkpoint, in `AskUserQuestion` options or otherwise. List them separately: `<id> <name> — PR #N, <status>`.
   - A dependency satisfied only inside an open PR (`closed` there, not on main) is **not** satisfied: the dependent checkpoint is blocked, "waits for merge of PR #N".
   - If the user explicitly names an in-flight step, say it already has PR #N and ask (`AskUserQuestion`) whether to continue that PR (`gh pr checkout <N>` on GitHub, or `git fetch origin <headRefName> && git switch <headRefName>` on Forgejo; then skip branch creation) or stop.
5. This is read-only. Never copy a PR's state or checkbox changes into main's files or the working tree — those files change only through the PR that owns them and arrive on main by merge.
6. Report the overlay in one short block before proposing anything. If the host's tool is unavailable or unauthenticated (`gh` not logged in, token env var empty, API returns 401/403), say the PR sync was skipped and why — don't silently proceed as if no PRs exist.

## C. Isolate the branch (after the checkpoint is chosen and its branch created)

The new work branch carries every roadmap in `docs/`, but a checkpoint PR concerns exactly one. Leave only the chosen roadmap in the **working tree** — nothing in git history changes.

1. Resolve everything that needs other roadmaps' files first (`<other-slug>:<id>` dependencies, `## Dependencies`), from the fresh default branch (section A). Hidden folders can't be read afterwards.
2. Require a clean tree (the branch was just created, so it should be). List roadmap folders: `git ls-tree -d --name-only HEAD docs/` → every `docs/<slug>/` except the chosen one that contains a `*-roadmap.md`. Folders without a roadmap file are not roadmap data — leave them.
3. Hide them with sparse-checkout, not deletion:
   ```
   git sparse-checkout set --no-cone '/*' '!/docs/<other-1>/' '!/docs/<other-2>/'
   ```
   Files leave the working tree but stay in the index and in every commit, so commits and the PR diff never contain deletions and merging the PR removes nothing from the default branch.
4. Never `rm`/`git rm` another roadmap's folder, and never commit its removal.
5. Restore with `git sparse-checkout disable` when the work ends (close-out in `references/executing-checkpoints.md` step 6) or before switching this checkout back to another roadmap. If the user asks to see other roadmaps meanwhile, disable first and say so.
6. If the checkout already has a sparse-checkout configuration the user set up (`git sparse-checkout list` non-empty before step 3), don't overwrite it — tell the user and skip isolation.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Reading `docs/<slug>/` from a stale local branch | Fetch first; compare with `origin/<default>` and read from it when the local copy is behind |
| Matching PRs to checkpoints by branch name or title | Only PRs whose diff touches `docs/*/roadmap-state.json` count |
| Offering a step that has an open PR as "next" | In-flight steps are listed separately and never offered |
| Treating `closed` inside an open PR as a satisfied dependency | Satisfied only once merged to the default branch |
| Writing the PR's state into main's working files "to sync" | The overlay is read-only |
| Removing other roadmaps with `rm`/`git rm` | `git sparse-checkout` only — deletions must never reach a commit |
| Reading another roadmap's state after isolation | Resolve cross-roadmap dependencies before step C |
