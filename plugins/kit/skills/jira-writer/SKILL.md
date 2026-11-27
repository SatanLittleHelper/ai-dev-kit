---
name: jira-writer
description: >-
  Prepares concise Jira-ready Russian issue drafts (title, structured description,
  acceptance criteria). Use when the user asks for a Jira task, backlog item, bug,
  spike, technical task, acceptance criteria, or a paste-ready issue before implementation.
  After approval it can also create the issue in Jira through the `jira` CLI of the kit.
  It can also add a comment to an existing issue and edit the title and description of an existing issue through the `jira` CLI.
---

# Jira Writer

Produces text for manual paste into Jira, or creates the issue itself through the `jira` CLI of the kit (Playwright over a local browser profile, no API token). Convention mirrors a typical `jira-writer` agent role: short issue, verifiable acceptance criteria.

## When to apply

- User says «напиши задачу», «написать задачу», «сделай задачу» — always Jira, no clarifying questions.
- Formulate or refine a Jira task, bug, spike, or tech debt item.
- Need a ready-to-paste title + description + acceptance criteria.
- Summarize planned or completed work as an issue (scope framing only).

## Output language

- **Issue text (Название, Описание, Критерии приемки, Дополнительно): Russian only.**

## Output format

Always output the issue in **Jira Wiki Markup** so the user can paste it directly into Jira:

- Headings: `h2.`, `h3.`
- Bullet lists: `*` (not `-`)
- Bold: `*text*`
- Code: `{{text}}` inline for **simple identifiers only** (letters, digits, underscores, parentheses — e.g. `{{getAddresses()}}`, `{{bpm_id}}`), `{code}...{code}` blocks
- **Never use `{{...}}` when the content contains dots (`.`), colons (`:`), angle brackets (`<>`), or spaces** — Jira treats `{{a.b}}` and `{{id: type}}` as unknown macros. Write such expressions as plain text or restructure the sentence. Examples: `{{care.repository.ts}}` → write as plain text `care.repository.ts`; `{{created_at ASC}}` → write as plain text `created_at ASC`; `{{addresses.name}}` → write as plain text `addresses.name`.
- **Never end a bullet point with `{{text}}`** — Jira fails to render the last `{{...}}` on a line. Always add a word or punctuation after it. This applies to ALL identifiers at end of line, including TypeScript type names, field names, method names. BAD: `* Секция: {{details}}` — GOOD: `* Секция: поле {{details}} (текст запроса)`; BAD: `* Метод {{findById(id)}}` — GOOD: `* Метод {{findById(id)}} в репозитории`.

Split the output into **two separate fenced code blocks** so the user can copy each part independently in Plannotator:

1. First block — the title only, plain text without any heading markup (no `h2.` prefix).
2. Second block — everything else, starting directly with `h3. Контекст` (omit the `h2. Описание` heading entirely).

Never wrap the entire issue in a single fenced code block.

These formatting rules are enforced by `node <base>/../../tools/jira/cli/main.mts draft lint <draft>` (see «After output»). Write for the linter, but don't rely on it alone: it checks form, not meaning.

## Approval: plannotator annotate loop (no Plan Mode)

Native Plan Mode is not used. Approve the draft through `rules/skills/document-approval.md`: stable path, `plannotator annotate --gate --json`, reopen the same file after edits.

When writing to a temp file for use with `plannotator annotate`, the file has exactly the same format as the chat output: **two fenced code blocks** (title, then body in Jira Wiki Markup), nothing else — no «Название»/«Описание» labels, no headings, no text between or around the blocks. Use `.md` extension (plannotator does not support `.txt`). Each block is then copied from Plannotator straight into the matching Jira field without any conversion.

**Why a file, not `plannotator last`:** `plannotator last` reads the previous completed turn. Since the issue and the Bash call happen in the same turn, `plannotator last` always captures the wrong message. Writing to a file and using `plannotator annotate` bypasses this entirely.

## Output structure (use these headings)

### Название

- Pattern: **optional `[context]` prefix(es) + action + object + goal/result**.
- Short, specific, implementation-oriented.
- Avoid vague titles ("Доработать логику", "Исправить баг").
- **Context prefixes — up to 2, in square brackets, before the title text.** A context prefix names the kind of work or the affected scope, e.g. `[тех-долг]`, `[web]`, `[api-gateway]`. Add one when it isn't obvious from the description alone (bug/feature work in a known app doesn't need it; tech debt, security hardening, or work spanning a specific app/component benefits from it). Never stack more than 2 — if a third context seems needed, drop the least essential one or fold it into the description instead. Example: `[тех-долг] Закрыть open redirect на странице /api/error`, `[api-gateway] Добавить повторную синхронизацию при частичном сбое смены статуса`.

### Описание

Use up to three subsections (Решение may be omitted, see below):

1. **Контекст** — why the task exists now. **1 sentence, hard cap.** State where this came from (an audit, a roadmap, an incident) and why it matters right now — nothing else. Background, scope notes, and "заодно..." asides belong in Проблема/Решение if they're load-bearing, or nowhere if they aren't. If the sentence isn't answering "why now", cut it.
2. **Проблема** — what is broken, missing, or inefficient. **Max 3 bullets** (`*`), one distinct problem per bullet, each **one line**. Merge related facts; drop minor ones instead of listing everything. One problem — one short sentence, no list. State the fact, let its severity speak for itself.
3. **Решение** — the direction of the change: what must move, be added, or be replaced, and roughly where. **Max 3 bullets**, each one line. **State direction, not a design doc.** Name the affected module/domain/layer (e.g. "модуль orders в api-gateway", "общие компоненты карточки заказа") so both a human and an AI implementer know unambiguously where to go — but do not name specific classes, method signatures, exact input()/output() shapes, or file paths unless a name is genuinely load-bearing (e.g. an existing thing being reused or removed, where ambiguity would send the implementer to the wrong file). The detailed design belongs to the later implementation plan (`writing-plans`), not the issue.
   **Omit Решение for a bug whose fix is just "make it behave as expected"** — Проблема plus Критерии приемки already say everything. Keep it only when the direction isn't obvious from the problem.

**Style — short and direct.** One sentence ≤ ~15 words, no introductory phrases, no formal connectors ("в связи с тем что", "необходимо отметить", "подтверждённый"), no stacked qualifiers. Plain words, but keep the technical specifics: cut words, not facts.

### Критерии приемки

- Flat checklist of **3–5** **observable, testable** outcomes, each one line.
- **Do not restate Решение.** Include only what can be verified from outside and is not obvious from Решение. If a criterion is just the Решение bullet in past tense — drop it.
- For bugs: include **expected behavior**, not only the symptom.
- For features: describe **user or system outcome**, not only implementation steps.

### Дополнительно

Include **only** when necessary to remove ambiguity: assumptions, dependencies, technical notes, or blocking questions.

By default **do not** add sections: `Объем`, `Технические заметки`, `Открытые вопросы` (unless the user asked or the task would stay ambiguous without them).

## Writing rules

- Brevity over completeness: if a sentence or bullet can be cut without losing a fact the implementer needs, cut it.
- Prefer precise product/technical nouns over generic wording.
- If details are missing: state **minimal explicit assumptions**; do not invent hidden requirements or external business context not given by the user or repo.
- Do not merge implementation status / changelog into the draft unless the user asked.
- Do not turn the issue into a full design document unless the user asked for that depth.
- Do not overload with scope boundaries and meta-notes by default.

## Optional inputs (ask only if blocking)

- Issue type (Story/Bug/Task/Spike), epic/link, priority, component, affected product or service.

## Template (copy and fill)

```
<Название задачи>
```

```
h3. Контекст
…

h3. Проблема
…

h3. Решение
…

h3. Критерии приемки
* …
* …
```

For a simple bug, drop the `h3. Решение` block entirely.

## After output

Approval flow (no native Plan Mode; see `rules/skills/document-approval.md`):

1. Write the issue draft into `tmp/drafts/<issue-slug>.md`, in exactly the format from «Template»: two fenced code blocks and nothing else — first block: title only; second block: body in Jira Wiki Markup, starting at `h3. Контекст`. No «Название»/«Описание» labels or any other text outside the blocks.
2. Check the draft: `node <base>/../../tools/jira/cli/main.mts draft lint tmp/drafts/<issue-slug>.md`. Exit code `1` — fix every error from the `errors` list in the same file and repeat; show the draft in Plannotator only once it is clean.
3. Open it with `plannotator annotate --gate --json` (version history on) and wait for the final decision.
4. If annotation feedback comes back — revise the same file and reopen it.
5. `dismissed` — stop, nothing is approved.
6. Once approved as-is (no annotation feedback) — do NOT reprint the issue text in chat. The user already saw and approved the exact draft via Plannotator/the approval flow; repeating it in chat is a pure duplicate. Next, offer to create the issue in Jira (see «Creating the issue in Jira»); if the user declines, or Jira is not configured, move on to the next step (e.g. writing-plans).

## Creating the issue in Jira

CLI: `node <base>/../../tools/jira/cli/main.mts <command>`, where `<base>` is this skill's «Base directory for this skill» (the tool lives in the same plugin, there is no copy in the skill). It reads `.claude/dev-conventions.json` of the current project: `jira.baseUrl` (required), `jira.defaultIssueType`, `jira.dryRun` and `ticketPrefix` as the Jira project key. If `jira.baseUrl` is missing, ask the user for it once and save it under `jira.baseUrl`; never invent it.

The browser profile with the user's Jira session lives in `~/.config/ai-dev-kit/jira/<host>/` and is shared by all projects of this developer. Nothing from it is committed.

1. **Check the session:** `node <base>/../../tools/jira/cli/main.mts status`. Exit code `2` means the user must sign in once: tell them to run `! node <base>/../../tools/jira/cli/main.mts login` (it installs `playwright-core` on first use and opens Chrome; they sign in via SSO/2FA and close the window), then repeat `status`.
2. **Ask before creating.** Creating an issue is visible to other people and cannot be undone by the CLI. Ask «Создать задачу в Jira сейчас?» (`AskUserQuestion`) and run `create` only after an explicit yes. Never create automatically after approval.
3. **Split the approved draft:** `node <base>/../../tools/jira/cli/main.mts draft split tmp/drafts/<issue-slug>.md` writes `<issue-slug>.title.txt` (title) and `<issue-slug>.body.txt` (body, Jira Wiki Markup) next to the draft and prints their paths as JSON. Do not cut the fenced blocks by hand.
4. **Create:**
   `node <base>/../../tools/jira/cli/main.mts create --title-file tmp/drafts/<issue-slug>.title.txt --body-file tmp/drafts/<issue-slug>.body.txt [--type <тип>] [--assignee me|<логин>] [--parent <KEY-N>] [--sprint "<имя>"] [--project <код>]`
   Pass optional flags only when the user named the value — except `--assignee`, which depends on the context of the call (see «Assignee by context» below). stdout is one line `{"key","url"}`; show the user the key and the link.
**Assignee by context.** Decide who the issue is assigned to from the situation the skill was called in, before running `create`:

- **Work on one concrete task** (the user is about to implement it, or is describing the work they are doing now: a bug found while working, a follow-up, «заведи задачу на то, что делаем») → add `--assignee me`, unless the user named another assignee (then pass that login) or said not to assign.
- **Batch creation from a roadmap** (the issues are checkpoints of a roadmap, drafted several at a time, the `roadmap` skill or `references/writing.md` is in play) → do NOT pass `--assignee`: the issues stay unassigned until someone picks them up. Pass it only if the user explicitly named an assignee.
- **Unclear which of the two it is** → ask once (`AskUserQuestion`) together with the confirmation of step 2.

5. **Exit codes:** `0` created; `1` configuration or usage error or markup validation failed (`create` checks title and markup; read stderr, fix the input); `2` sign in required; `3` a field value was not found in Jira (the issue was NOT created: name the field and ask for another value); `4` the browser profile is busy with another run (wait and retry); `5` the state after pressing Create is unknown — **do not retry**, ask the user to check Jira for the issue before doing anything else.
6. Delete the `*.title.txt` and `*.body.txt` temporary files from the `draft split` output after a successful run.

**Dry run for debugging the scenario.** Add `--dry-run` to `create`: Chrome opens with a visible window, the form is filled in front of the user, Create is not pressed and nothing is saved; the command ends when the user closes the window and prints `{"dryRun":true,…}`. Use it when checking the CLI against a real project (or after a Jira update); never use it as a substitute for the explicit confirmation in step 2. `jira.dryRun: true` in `.claude/dev-conventions.json` makes every `create` a dry run by default (stderr says so); `--no-dry-run` overrides it for one real creation, and the command-line flag always wins over the setting. With `jira.dryRun` on, ask for the explicit «да» of step 2 and only then add `--no-dry-run`.

## Commenting on an existing issue

Use when the user asks to leave a comment on a Jira issue («оставь комментарий в ABC-123», «напиши в тикет»). Session check: step 1 of «Creating the issue in Jira».

1. Write the comment in Russian, Jira Wiki Markup (same formatting rules as the issue body; no `h2.`, no headings unless needed). Keep it short.
2. Save it to `tmp/drafts/<issue-key>.comment.txt` and run `node <base>/../../tools/jira/cli/main.mts draft lint tmp/drafts/<issue-key>.comment.txt --kind markup`. Exit code `1` — fix the listed errors and repeat.
3. Show the text in chat and ask «Добавить комментарий в <KEY>?» (`AskUserQuestion`). Run the command only after an explicit yes — a comment is visible to other people and the CLI cannot take it back.
4. `node <base>/../../tools/jira/cli/main.mts comment <KEY> --body-file tmp/drafts/<issue-key>.comment.txt` (add `--no-dry-run` when `jira.dryRun` is on and the user said yes). stdout: `{"key","url","result"}` — tell the user the link.
5. Exit code `5` — the comment may or may not have been added: **do not retry**, ask the user to check the issue. Other codes — as in «Creating the issue in Jira». Delete the temporary file after a successful run.

## Editing an existing issue (title and description)

Use when the user asks to change the title or description of an existing Jira issue («поправь описание ABC-123», «переименуй задачу»). Only these two fields; nothing else is editable through the CLI.

1. Read the current state: `node <base>/../../tools/jira/cli/main.mts get <KEY> --with-description` → `title`, `description` (raw Wiki Markup).
2. Write the new version into `tmp/drafts/<KEY>-edit.md` in the same two-fenced-blocks format as a new issue (title, then body), changing only what the user asked for; keep the rest of the text as it was. Run `draft lint` on it (as in «After output» step 2) and approve it in Plannotator (`--gate`, version history on). If the user asked to change only one field, still show both blocks, but pass only that field to the CLI.
3. After `approved`, ask «Записать изменения в <KEY>?» (`AskUserQuestion`); run `edit` only after an explicit yes.
4. `draft split tmp/drafts/<KEY>-edit.md`, then `node <base>/../../tools/jira/cli/main.mts edit <KEY> [--title-file <title.txt>] [--body-file <body.txt>]` — pass only the files of the fields that changed. stdout: `{"key","url","result","changed"}`; `unchanged` means Jira already had these values.
5. Exit code `5` — do not retry, ask the user to check the issue. Delete the temporary files after a successful run.

Both commands accept `--dry-run` (visible window, nothing saved) and honour `jira.dryRun` exactly like `create`.
