# Jira: стори и подзадачи из роадмапа

Use after a roadmap is approved and saved (`roadmap create`), or later for a roadmap whose steps still have `Jira: TBD`. Requires `jira.baseUrl` in `.claude/dev-conventions.json`; without it say so and stop. Types come from `jira.roadmapStoryType` (default Story) and `jira.roadmapChildType` (default Sub-task).

1. Session: `node <base>/../../tools/jira/cli/main.mts status` (exit code `2` — the user runs `! … login`).
2. Build the draft: `node <base>/../../tools/roadmap/cli/main.mts tickets <slug>` → `tmp/drafts/<slug>-tickets.md` (story from the roadmap context, one sub-task per unchecked step, texts converted to Wiki Markup).
3. Fix the texts by hand where the converter left plain text; every ticket stays two fenced blocks (title, body) under `## story` / `## <step id>`.
4. Lint: `node <base>/../../tools/jira/cli/main.mts draft lint tmp/drafts/<slug>-tickets.md --kind tickets --state docs/<slug>/roadmap-state.json`; exit code `1` — fix the listed errors and repeat.
5. Approve the file in Plannotator per `rules/skills/document-approval.md` (`--gate`, version history); `dismissed` — stop.
6. Ask «Создать стори и N подзадач в Jira?» (`AskUserQuestion`); only after an explicit yes: `node <base>/../../tools/jira/cli/main.mts create-roadmap tmp/drafts/<slug>-tickets.md --state docs/<slug>/roadmap-state.json --no-dry-run`.
7. Exit code `5` — a ticket may or may not exist: do not retry, ask the user to check Jira, then `--resolve <id>=<KEY>` (it exists) or `--resolve <id>=retry` (create again). A re-run resumes from the tickets not yet created.
8. Link: `node <base>/../../tools/roadmap/cli/main.mts link <slug> --from tmp/drafts/<slug>-tickets.created.json` writes keys into the roadmap lines, `roadmap-state.json` and the story key under the title.
9. Delete the draft and `*.created.json` after a successful link. Never commit anything unasked.

`--dry-run` (on `create-roadmap`) fills only the first form without saving. Assignee is not set (batch creation from a roadmap).
