# Writing Test Plans — Stage A

Planning is two stages, each with its own document and its own approval cycle:

- **Stage A — test plan** (this file): *what* each test verifies and *why*, as behavior, with no code. Unit first, then integration, then e2e.
- **Stage B — implementation plan** (`rules/skills/writing-plans.md`): test code for the Stage A test IDs, then the minimal implementation that makes them pass.

There is no `superpowers:*` skill for Stage A; this file owns the process. The execution phase (red → verify red → green → refactor) is unchanged and lives in `rules/base/test-execution-policy.md`.

## When it runs and when it is skipped

Runs after the design is approved and before `rules/skills/writing-plans.md`. It starts automatically once the design is approved and saved; and once the test plan is approved and saved, Stage B starts automatically the same way. Do not ask for confirmation between stages. Read `rules/base/testing.md` and `rules/base/test-execution-policy.md` first; the layer table in `testing.md` decides scope.

**Skip Stage A entirely** when the change has no test-worthy layer: Markdown-only edits, components, thin repositories/API clients, pure mappers. Where a test cannot be written, planning one is pointless. Skip without an approval cycle and record one line in the implementation plan: «План тестов не требуется: <причина>».

"Every function has a test" applies only inside the layer table: every unit in scope is covered, and every exclusion is named with its reason. Do not widen the table from a generic TDD checklist.

## Design order

1. **Unit** — every in-scope unit from the layer table: services with branching, guards, validators, fallback and error-handling branches, frontend stores/services/helpers.
2. **Integration** — only where a layer requires it (repositories with query logic against a real database).
3. **E2E** — fast e2e with a mocked API for pages; backend e2e for HTTP contract and authorization; full-stack only for cross-system scenarios; Storybook e2e for a UI-kit library. When a page or state has a mockup, add a case tagged `[e2e, скриншот]` for each mockup state (reference image, viewport, tolerance); see `rules/base/testing.md` → "Visual e2e against mockups".

## Before drafting: check the runners

For each layer you plan to use, check that it has a runner and a scoped command. This check is the author's step and does **not** appear in the document. A gap follows `rules/base/testing.md` → "Missing Test Infrastructure": add a preparatory task to the implementation plan or stop; never drop the test or silently fall back to a weaker layer.

## Document

Store at `docs/superpowers/plans/YYYY-MM-DD-<feature>-tests.md` after approval (inside a roadmap step: the step folder, next to the plan). **Write it in Russian** — see `rules/base/workflow-and-misc.md` → "Documentation Language"; test IDs, layer names, and identifiers stay as-is. The document is meant to be read by a person, so keep it scannable: no separate matrix, no per-case boilerplate. Sections:

1. **Спека и цель** — link to the approved design, one-sentence goal.
2. **Требования и кейсы** — the main section. Cases are grouped by spec requirement (see below).
3. **Не покрываем** — table `Что | Почему` for excluded units/branches.
4. **Сигналы дизайна** — places where a test is hard to describe or needs "mock everything" (see TDD's "Test hard = design unclear"); these go back to the spec, not around it. Include the section only if there are signals.

### Requirements and cases

Each spec requirement is a level-2 heading: `## R1 · <requirement>`. Under it go its cases, ordered unit → integration → e2e; the layer is a tag in the case title. A requirement with no case still gets its heading and one line `Не покрываем: <причина>` — a coverage gap is visible from the structure, without a separate matrix. A layer that is not needed gets no line of its own.

Group the cases of one unit together and state its mocks once, as the first line of the group: `Моки: UserRepository — внешняя граница`. Do not repeat mocks per case; state no mock configuration.

### Case card

```
**U1 · 404, если пользователь удалён**  [unit]
- Дано: пользователь с deletedAt
- Когда: getUser(id)
- Тогда: NotFoundException
- Ловит: удалённый пользователь снова отдаётся
```

- **ID** (`U1`, `I1`, `E1`, numbered continuously through the document) and a title that states the behavior.
- **Дано / Когда / Тогда** in observable terms (return value, rejection, thrown error, calls that must or must not happen), with concrete values.
- **Ловит** — the concrete break this case would catch. Mandatory.
- **Tautology check is not written in the card.** The author verifies it silently: the case must fail if the implementation is replaced with `return mockResult`. Add one line `- Tautology: …` only when the reason is not obvious from Дано/Когда/Тогда.

One case, one behavior; an "and" in the name means two cases. Branch coverage follows `rules/base/testing.md` → Coverage: a `try/catch`, null check, or early return in the spec normally means at least two cases; timeout, upstream error, and non-`Error` rejection are covered when the spec defines behavior for them.

**No implementation detail in Stage A:** no test code, no private method names, no exact mock setup. Those belong to Stage B.

## Review loop (before the user sees it)

The author is the main agent, drafting in `tmp/drafts/<feature>-test-plan.md`. The user sees only the document that came out of this loop, through Plannotator approval (`rules/skills/document-approval.md`, no native Plan Mode). The reviewer is Codex through the `doc-review` skill, not a Claude subagent: an independent model, the six-point test-plan check lives in the skill (`--type=test-plan`).

1. Draft the document in the draft file.
2. **Self-check before the first review**, silently, so the reviewer is not spent on mechanics: every spec requirement has an `## R*` heading; every case has Дано / Когда / Тогда / Ловит and a layer tag; IDs are numbered continuously; no placeholders («TBD», «и т.д.», «аналогично U2»); no test code, private method names, or mock setup; one behavior per case; each case passes the `return mockResult` tautology check.
3. Invoke the `doc-review` skill on the draft, **at most 3 iterations**:
   ```
   /doc-review tmp/drafts/<feature>-test-plan.md --type=test-plan --max=3 --profile=<P> --focus="<inputs>"
   ```
   - `<P>` is the profile that runs the review: `codex.review.profile`, else `codex.profile`, else `codex`, read from `.claude/dev-conventions.json` (see `rules/orchestrator.md` → Project config). Pass it explicitly and **do not ask the user** which profile to use; the profile question is for manual `/doc-review` runs.
   - `<inputs>` names what Codex must read first: the approved design spec (path), `rules/base/testing.md` and `rules/base/test-execution-policy.md` (paths as they exist in this project, usually under `.claude/ai-dev-kit/`), and `testing-anti-patterns.md` from the `superpowers:test-driven-development` skill directory.
   - Codex only reads. The `doc-review` loop applies the fixes itself: fix every critical/high finding, or reject it with a reason when it contradicts the spec, `rules/base/testing.md` or this file; minor findings only when cheap. Rejection reasons stay out of the document: `doc-review` records them in the iteration note and passes them to the next round, where Codex only verifies the fixes and may raise new major findings on changed text only.
   - The draft lives in the untracked `tmp/`: skip `doc-review`'s optional git steps (no pre-flight or post-loop commit).
4. The loop ends at `VERDICT: NO_MAJOR_ISSUES` or after 3 iterations (`--max=3`).
5. If the limit is reached with major findings left, still open it for approval, but add a «Не сошлись» block at the top: each remaining major finding, the reviewer's position and the author's position. The user is the tiebreaker.
6. If `doc-review` or the `codex` CLI is unavailable, follow `rules/base/workflow-dependencies.md`: name the dependency, offer installation, keep this step pending. Do not silently fall back to a Claude subagent or skip the review.

After approval, save to the target path. Stage B starts a new approval cycle with a fresh draft file that does not contain this document. Once the test plan is approved, start Stage B in the same turn: read `rules/skills/writing-plans.md` and start a fresh draft file. Do not end the report with «Начинать?» or any other request for confirmation: the approval of the test plan is the go-ahead. A late edit made at the user's decision after the last review round (for example, one added case) does not change this.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Writing test code or mock setup in the test plan | Describe behavior only; code is Stage B |
| Case named after a method («тест getUser») | Name the behavior: «возвращает 404, если пользователь удалён» |
| Planning tests for components, thin repositories/clients, mappers | Skip them; name the exclusion in «Не покрываем» |
| Starting Stage A for a Markdown-only change | Skip it; write the one-line «План тестов не требуется» in the plan |
| Requirement with no cases and no `Не покрываем: <причина>` line | Add the line or the cases |
| Showing the user a draft before the review loop | Run the loop first; the user sees the result |
| Five-field prose block per case | Four-line card: Дано / Когда / Тогда / Ловит |
| Separate coverage matrix or infrastructure section in the document | Group cases under requirement headings; the runner check is the author's step, not a section |
| Reviewer loop with no limit | `--max=3`: stop at `NO_MAJOR_ISSUES` or after 3 iterations, with a «Не сошлись» block |
| Sending a draft to the reviewer without the self-check | Run the mechanical self-check first |
| Silently ignoring a finding, or redoing the same fix round after round | Mark it `rejected: <reason>` and pass it to the next round |
| Reviewing the test plan with a Claude subagent | Review it through `doc-review --type=test-plan` (Codex) |
| Asking the user which profile to review with | Pass `--profile` from `.claude/dev-conventions.json` (default `codex`); the question is for manual runs |
| Rejecting a finding without a reason in the iteration note | The note is what Codex sees next round; write `rejected <ID>: <reason>` |
| Appending the implementation plan to the approved test plan's draft file | One document per approval cycle; start Stage B in a fresh draft file |
