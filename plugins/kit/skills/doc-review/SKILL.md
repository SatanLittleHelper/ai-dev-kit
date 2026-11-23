---
name: doc-review
description: "Automated Codex review loop for design proposals and implementation plans. Warms a single Codex session across iterations, applies edits directly to the doc without touching git, and converges on `VERDICT NO_MAJOR_ISSUES`. Git is only touched if the user opts in (pre-flight warning + optional single post-loop commit). Invoke as `/doc-review <doc-path> [focus]`."
---

# Doc Review Loop

FOR CLAUDE CODE ONLY. Automate the iterative review workflow for markdown design docs and implementation plans. A sidecar CLI owns the Codex session lifecycle and state; this skill drives the loop, classifies findings, edits the doc, and handles the two optional git touch-points (pre-flight warn, post-loop single commit). The sidecar itself never runs git commands that mutate state.

## Личные настройки пользователя

Этот скилл использует только его владелец, правила ниже действуют во всех проектах.

- **Когда запускать.** На просьбу «посмотреть план», «сделать ревью плана», «проверить план» или любую аналогичную формулировку всегда запускать `/doc-review <путь-к-файлу>`. Не читать файл вручную и не давать ревью в чате.
- **Git-шаги пропускать.** При ручном запуске пропускать Step 0 (pre-flight: предложение закоммитить грязный файл) и Step 4 (post-loop: предложение закоммитить правки). Сразу переходить к Step 1 (Initialize), завершать на Step 3 (Finalize). Git в этом процессе не используется.
- **Путь к sidecar-скрипту.** Скилл при загрузке печатает «Base directory for this skill: <path>», скрипт лежит по `<path>/scripts/doc-review.mjs`. Использовать этот путь напрямую; не искать скрипт через `find ~/.claude ...` (сканирование вне проекта вызывает запрос подтверждения).
- **Отчёты** `iter-N-report.md`, `state.json`, `final-summary.md` лежат в `<корень проекта>/.doc-review/<slug>/` и читаются обычным `Read`. Папка в `.gitignore`, чистить перед коммитом не нужно.

## Invocation

```
/doc-review <doc-path> [focus phrase...]
/doc-review --type=plan|design|test-plan <doc-path>
/doc-review --profile=<name> <doc-path>
/doc-review --max=N <doc-path>
/doc-review --timeout=<minutes> <doc-path>
/doc-review --resume <doc-path>       # default behavior when state already exists
/doc-review --reset <doc-path>        # archive prior loop and start fresh
/doc-review --status <doc-path>       # print state.json and exit, no iteration
```

- **`<doc-path>`** (required): path to the markdown file. If missing, **stop immediately** and ask the user to provide it — never guess.
- **`--type=<plan|design|test-plan>`** (optional): selects the review lens. Auto-detects from path when omitted — `*-tests.md` / `*-test-plan.md` are treated as test-plan; common conventions like `/plans/` as plan; `/design-docs/`, `/design/`, `/proposals/` as design; fallback is plan. Pass explicitly when the project uses different conventions or when the heuristic is likely wrong for this doc.
- **`--profile=<name>`** (optional): which model backend runs the review — `codex` (stock Codex, the default), `local` (the kit-default profile for your own OpenAI-compatible model server) or any other name from `codex.profiles` in the project config. Overrides the project config and skips the profile question; see "Profiles" below.
- **`--max=N`** (optional): hard iteration cap. Default **6**. Maximum **10**. Sidecar refuses further iterations past the cap.
- **`--timeout=<minutes>`** (optional): per-iteration Codex timeout. Default **20**. Max **60**. Bump when reviewing dense plans.
- **Remaining text** (optional): focus comment passed to every iteration (e.g., "pay attention to error handling around retries").

## Review lens: design doc, implementation plan, test plan

The three doc types get meaningfully different prompts:

- **Design doc** (principles, UX, architecture): review lens is **coherence and cross-doc referential integrity**. Codex verifies citations against the docs they point at, checks that illustrated flows map cleanly to the named decisions, and flags unacknowledged trade-offs, blurry scope boundaries, and over-specification that leaks code-level detail belonging in a plan.
- **Implementation plan** (concrete work for a coding agent): review lens is **claim accuracy against the actual code**. Codex opens the source files the plan names and verifies every function / type / column / config reference; checks step ordering and commit boundaries; validates the testing strategy against whatever testing conventions the project encodes; and flags ambiguities a fresh coding agent would resolve wrong.
- **Test plan** (Stage A of the kit's two-stage planning: behavior cases per spec requirement, no code): review lens is the six-point test-plan check — spec coverage (every requirement has an `## R*` heading with cases or `Не покрываем`), layers per the project's testing rules, branches the spec defines, tautology (would the case pass with `return mockResult`), behavior not implementation, testing anti-patterns. "Major" problems map to `critical`/`high`; wording and ordering are `medium`/`low` and never block. Pass the inputs Codex needs through `--focus`: path to the approved design spec, to the project's `testing.md` / `test-execution-policy.md` and to `testing-anti-patterns.md`. From round 2 Codex only **verifies the fixes** and may raise new major findings only on changed text; findings the author rejected with a reason are accepted unless the reason is factually wrong — so in `record-iteration --note` always list what was fixed **and** every rejected finding with its reason: for this type the note is passed to Codex in the next round.

If a doc doesn't fit cleanly into any bucket, pass `--type` explicitly to pick the lens you want.

All state and reports land in `.doc-review/<doc-slug>/` **in the working directory where Claude Code is running** (not in the plugin/skill directory). The sidecar adds `.doc-review/` to `.gitignore` on first run if not present.

## Profiles

A profile picks the model backend that runs the review; the prompts, the loop and who edits the doc are identical. Definitions are shared with the `kit:codex-implement` skill (same `codex` config block in `.claude/dev-conventions.json`, same resolver `scripts/profiles.mjs` — keep the two copies identical), so a backend is described once. This skill uses the **`review`** role.

Profile name, highest first: `--profile` → `codex.review.profile` → `codex.profile` → `codex`. Model/effort/timeout: CLI flags → `codex.review.*` (only for the role's own default profile) → profile fields → built-in defaults (`codex`: model `gpt-5.6-luna`, effort `medium`).

```json
{
  "codex": {
    "profiles": {
      "local": {
        "model": "my-model",
        "provider": { "baseUrl": "https://llm.example.com/v1", "envKey": "LOCAL_LLM_API_KEY" }
      }
    },
    "implement": { "profile": "local" },
    "review":    { "profile": "codex", "model": "gpt-5.6-terra" }
  }
}
```

The kit ships the `codex` and `local` profiles as defaults: `setup.sh` and `update-ai-dev-kit` add them to `.claude/dev-conventions.json` (missing keys only, never overwriting yours, never a secret — only the env var name `LOCAL_LLM_API_KEY`). `local` comes with `YOUR-…` placeholders for the model and `baseUrl`: fill them in, and check that the server speaks the Responses API ("Checking your server" in `codex-implement/SKILL.md`). Until the placeholders are replaced the profile is unconfigured and is not offered in the profile question.

Full field reference (`provider`, `modelProvider`, `codexProfile`, `envKey` rules): see the "Profiles" section of `codex-implement/SKILL.md`.

- **Profile choice at the start of a fresh loop** (no `.doc-review/<slug>/state.json` yet, no `--profile`): read `codex.profiles` from `.claude/dev-conventions.json`; if the built-in `codex` plus the defined profiles give **two or more** candidates, ask with `AskUserQuestion` — one option per profile, description = model and host in one line (never print `envKey` values), the `codex.review.profile` first as "(Recommended)". With one candidate, do not ask. Pass the choice to the first `next` as `--profile=<name>`. On resume, never ask: the stored profile is reused.
- **Runs started by the kit's workflow rules never ask** (test plan and implementation plan validation, `rules/skills/writing-test-plans.md` and `writing-plans.md`): the rule passes `--profile=<codex.review.profile, else codex.profile, else codex>` explicitly, together with `--type`, `--max=3` and `--focus`. The question is for manual `/doc-review` runs without `--profile`.
- The profile is resolved once at the first `next` and stored in `state.json`; later iterations reuse it. To change it, `--reset`.
- The API key env var named by `provider.envKey` must be exported in the shell that launches the sidecar; the first `next` fails early if it is not.
- A non-Codex model may be weaker at verifying plan claims against the code and at producing the exact `VERDICT:` line; a report without a parseable `VERDICT:` line never counts as converged, so the loop keeps going until the iteration cap.

## Git discipline

- **The sidecar NEVER touches git.** No stage, no commit, no diff, no show. The review loop is a pure sequence of doc edits.
- Git is touched **only at two optional user-consented points**, both driven by this skill via plain Bash `git` calls:
  1. **Pre-flight (Step 0):** if `<doc-path>` has uncommitted changes going into the review, warn the user and offer to commit them first — so the review's edits can be cleanly reviewed as a separate diff at the end.
  2. **Post-loop (Step 4):** after the loop exits, ask the user whether to stage and commit the accumulated doc edits as a single commit.
- If the user declines either prompt, the skill proceeds without touching git. The doc ends the loop with whatever uncommitted edits the review applied — the user reviews and commits on their own time.
- If the working directory is not a git repo, both prompts are skipped silently.

## Sidecar CLI

The sidecar lives at `${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs` — invoke it via `node`. It is pure plumbing: it owns the Codex process lifecycle, session-id capture, prompt substitution, and state persistence. It does **not** reason about findings — that's this skill's job — and it does **not** touch git.

```
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs" status            <doc-path>
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs" next              <doc-path> [--type=plan|design|test-plan] [--max=N] [--timeout=<minutes>] [--profile=<name>] [--effort=medium] [--model=<name>] [--focus="..."]
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs" record-iteration  <doc-path> --note="<one-line summary>" [--no-changes]
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs" finish            <doc-path> --reason=converged|cap-hit|aborted
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs" reset             <doc-path>
```

`next` prints a single JSON line on stdout with the fields `{iter, report_path, status_path, converged, blocking_count, total_count, verdict}`. Parse it and act on `verdict` / `converged`. Exit code is non-zero if Codex errored — read the printed hint (e.g., "run `codex login`") and stop.

## Execution contract

### Step 0 — Pre-flight git check

Before invoking the sidecar for iteration 1 (skip entirely on resume — pre-flight was handled on the original run):

1. If not inside a git repo (`git rev-parse --is-inside-work-tree` fails), skip this step silently.
2. Otherwise, run `git status --porcelain -- <doc-path>`. If the output is empty, skip.
3. If the doc is dirty (staged or unstaged changes), tell the user:
   > `<doc-path>` has uncommitted changes. Committing them first keeps the review's edits reviewable as a separate diff. Options: `yes` (I commit them now), `no` (proceed with them included — review edits will mix with your existing changes), `abort`.
4. On `yes`: stage only `<doc-path>`, commit with message `pre-doc-review: save existing edits to <doc-slug>` + Claude co-author footer. Confirm the SHA to the user, then proceed.
5. On `no`: proceed.
6. On `abort`: stop; do not initialize the loop.

If other unrelated paths are dirty in the working tree, ignore them — this step cares only about `<doc-path>`.

### Step 1 — Initialize

1. If invoked with `--status`, run `node ... status <doc-path>`, print the JSON, **stop**.
2. If invoked with `--reset`, run `node ... reset <doc-path>` first, then proceed with a fresh loop (re-run Step 0).
3. Announce to the user: "Starting `/doc-review` on `<doc-path>` — max=N iterations, focus=`<focus or 'none'>`. State and reports: `.doc-review/<doc-slug>/`."
4. If state.json already exists for this doc and `--reset` was not used, announce "Resuming from iteration `<last-completed + 1>`." Skip Step 0.

### Step 2 — Review loop

Repeat until a stop condition fires. For each iteration:

#### 2a. Call the sidecar to run Codex

```
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs" next <doc-path> [--max=N] [--focus="..."]
```

- Iteration 1: the sidecar runs `codex exec --json --output-last-message iter-1-report.md -m <model> -c model_reasoning_effort=<effort> "<initial-prompt>"` and captures the session id from the JSONL event stream.
- Iteration N>1: the sidecar runs `codex exec resume <session-id> --json --output-last-message iter-N-report.md -m <model> -c model_reasoning_effort=<effort> "<followup-prompt>"`, reusing the same Codex thread (warm context). The followup prompt tells Codex the doc was revised and to re-read it with fresh eyes — Codex uses its warm-context memory of the prior version to spot what changed. No diffs or snapshots are fed in.

Run the sidecar call via `Bash` with `run_in_background: true` — a single iteration can run for a while (up to the per-iteration timeout, default 20 min, cap 60 min), and this must not block the conversation turn. The background task's own completion notification (the sidecar process exiting) *is* the "this iteration finished" signal — do not add a separate polling loop that re-checks `doc-review.mjs status` on a timer to detect completion. A `Monitor` tailing the iteration's own progress log for live visibility (below) is a different thing and is fine — it never substitutes for this completion signal, it just adds interim narration on top of it.

Tell the user: "Iteration N — Codex running in the background (warm context, session `<id-prefix>`)…"

**Optionally, for live visibility while Codex works** — this is purely cosmetic and never replaces the completion signal above: start a separate `Monitor` (not another `Bash run_in_background`) that tails that iteration's own progress log, `.doc-review/<slug>/iter-N-stdout.jsonl`, filtered into one readable line per event, e.g.:
```
tail -f -n 0 ".doc-review/<slug>/iter-N-stdout.jsonl" | jq -c --unbuffered '
  if .type=="item.completed" and .item.type=="agent_message" then "MSG: " + .item.text
  elif .type=="item.completed" and .item.type=="command_execution" then "CMD done (exit " + (.item.exit_code|tostring) + "): " + .item.command
  elif .type=="item.started" and .item.type=="command_execution" then "CMD start: " + .item.command
  elif .type=="item.completed" and .item.type=="file_change" then "FILES changed: " + ([.item.changes[].path] | join(", "))
  else empty end' -r 2>/dev/null
```
Use `Monitor` (not `Bash`) here specifically because it is built for "one notification per line, indefinitely" — a plain `Bash run_in_background` only yields a single notification on process exit, which is already spoken for by the sidecar call itself. Stop the tail with `TaskStop` once that iteration's sidecar call completes: the sidecar deletes and recreates `iter-N-stdout.jsonl` fresh at the start of every iteration, so a stale tail from iteration `N` left running would either go silent or (worse) pick up the new file's unrelated events under the old iteration's label. Start a fresh `Monitor` against `iter-(N+1)-stdout.jsonl` for the next iteration.

Timeout per iteration is 20 minutes (override with `--timeout=<minutes>`, hard cap 60). On timeout the sidecar leaves `pending_iter` set and the session resumable — re-run `next` to retry.

#### 2b. Read the report

Open `.doc-review/<slug>/iter-N-report.md`. It contains Codex's full review followed by a single `VERDICT:` line (`NO_MAJOR_ISSUES` or `ISSUES_REMAIN`). The sidecar already parsed the verdict and reported it in the JSON stdout — trust that for loop control, but read the report for the findings.

#### 2c. Classify findings

For each finding in the report:

- **Blocking**: `critical` or `high` severity — logical errors, incorrect file/API references, missing steps, architectural issues, dangerous ambiguity.
- **Nit**: `medium` or `low` severity — wording tweaks, style preferences, optional enhancements. Default to **skip**; note them in the per-iteration report for the user.

#### 2d. Validation discipline (lightweight)

For each blocking finding:

- Read only the **affected sections of the doc itself** to confirm the finding makes sense.
- Spot-check **one or two source-code references** only if a finding looks self-contradictory, names a surprising path/function, or contradicts your prior knowledge of the code.
- Trust the rest — Codex was run with `medium` effort and the rigorous prompt. Exhaustively re-verifying every finding is the credit-burning anti-pattern this skill is meant to avoid.

If a finding is clearly wrong (e.g., names a function that doesn't exist and the recommendation depends on it existing), **reject** it and record the one-line reason.

#### 2e. Apply fixes

- One `Edit` per finding, scoped to the flagged section.
- Do **not** expand scope, refactor unrelated sections, or rewrite the doc from scratch.
- Preserve the doc's existing format and structure.

#### 2f. Record the iteration

```
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs" record-iteration <doc-path> --note="<2-line summary of what changed this round>"
```

The sidecar writes `iter-N-applied.md` with the note and appends the note to `state.iter_notes`. **No staging, no commit, no git interaction.**

If you made **no edits** this round (every finding was a nit or rejected), pass `--no-changes` (and optionally a `--note="..."` describing why). The sidecar records that no edits happened — the next iteration's prompt will reflect this.

Keep notes tight and user-facing — they get printed verbatim in the final report.

#### 2g. Report inline to the user

One compact line:

> Iteration N: M findings → A applied, S skipped (nits), R rejected (reason). Verdict: `NO_MAJOR_ISSUES` | `ISSUES_REMAIN`.

#### 2h. Iterate or stop

- If the sidecar reported `converged: true` → go to Step 3 with reason `converged`.
- If `iter >= max` → go to Step 3 with reason `cap-hit`.
- Else → back to 2a.

### Step 3 — Finalize sidecar state

```
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-review/scripts/doc-review.mjs" finish <doc-path> --reason=converged|cap-hit|aborted
```

The sidecar writes `.doc-review/<slug>/final-summary.md` aggregating: doc path, iterations run, terminal reason, per-iteration applied notes, last Codex verdict, any remaining medium/low findings worth considering.

### Step 4 — Report to the user and offer commit

Print a compact report to chat in this shape (adapt to actual findings; keep it tight):

```
Doc review on <doc-path>: <status> after N/M iterations.

Per-iteration findings:
- iter 1: <one-line summary of blocking findings>.
- iter 2: <one-line summary>.
- ...
- iter N: <one-line summary OR "clean — VERDICT: NO_MAJOR_ISSUES">.

Edits applied:
- iter 1: <note from record-iteration>.
- iter 2: <note>.
- ...

Full reports: <final-summary-path>
```

Keep each line to one sentence. The user reads this to quickly sanity-check whether anything went off the rails — do **not** include raw severity counts, Codex quotes, or long excerpts.

Then, if inside a git repo and the doc has unstaged edits (`git status --porcelain -- <doc-path>` non-empty), ask:

> Doc review made edits across N iterations, currently uncommitted. Commit as a single commit? Options: `yes` (stage and commit `<doc-path>` only, message: `doc-review: <terminal-reason> after N iterations (<doc-slug>)`), `no` (leave uncommitted for you to review/stage manually).

- On `yes`: `git add -- <doc-path>`, `git commit -m "<message with Claude co-author footer>"`, confirm SHA to user.
- On `no`: print the exact command the user can run themselves and stop.

If not a git repo, or the doc has no unstaged edits (e.g., the loop made zero changes), skip the commit prompt.

**Do NOT begin implementation.** The terminal state is "doc is ready for your review."

## Stop conditions (any one triggers terminal state)

- Codex returns `VERDICT: NO_MAJOR_ISSUES`.
- `iter == max` (default 6).
- Sidecar reports an unrecoverable error after one retry (e.g., `codex` auth dead, disk full).
- User Ctrl-C — state survives, next `/doc-review <same-path>` resumes from the last completed iteration without re-running it.

## Important constraints

- **Codex never edits the doc.** The sidecar does not pass `--write` or `--dangerously-bypass-approvals-and-sandbox`. All edits happen via Claude Code's `Edit` tool — the human-in-the-loop safety net against Codex hallucination.
- **Sidecar never touches git.** Git is only touched via explicit Bash calls in Step 0 and Step 4, with user consent each time.
- **Never rewrite the doc from scratch.** Each iteration makes targeted, validated fixes to flagged sections only.
- **Never begin implementation** after the loop. The output is an improved doc.
- **Always verify** a blocking finding before applying it if the recommendation names a surprising path/function or contradicts your prior knowledge — but do not exhaustively second-guess every finding.
- **State lives in the CWD, not the skill.** `.doc-review/<slug>/` is written relative to the working directory Claude Code was launched in. The sidecar refuses to write outside CWD.
- If `codex` is not available or returns auth errors, tell the user to run `codex login` or `/codex:setup` and stop.

## Troubleshooting

- **"state dir locked"**: another `doc-review next` is running on the same doc. Wait or inspect `.doc-review/<slug>/.lock`.
- **Resume after crash**: just re-run `/doc-review <same-doc-path>`. The sidecar detects dirty state, re-runs the incomplete iteration cleanly using the stored session id (no fresh thread, no re-exploration).
- **Session id missing**: rare; sidecar falls back to scanning `~/.codex/sessions/` for the newest file written during the run. If still missing, `reset` and start a fresh session.
- **Pre-flight commit conflicts**: if Step 0's commit fails (e.g., a pre-commit hook rejects it), surface the error and stop — let the user resolve before re-running `/doc-review`. Don't bypass hooks.
- **Post-loop commit conflicts**: same — if the final commit fails, tell the user and leave the doc edits in place. Don't retry destructively.
