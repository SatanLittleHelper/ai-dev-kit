# Writing Test Plans — Stage A

Planning is two stages, each with its own document and its own approval cycle:

- **Stage A — test plan** (this file): *what* each test verifies and *why*, as behavior, with no code. Unit first, then integration, then e2e.
- **Stage B — implementation plan** (`rules/skills/writing-plans.md`): test code for the Stage A test IDs, then the minimal implementation that makes them pass.

There is no `superpowers:*` skill for Stage A; this file owns the process. The execution phase (red → verify red → green → refactor) is unchanged and lives in `rules/base/test-execution-policy.md`.

## When it runs and when it is skipped

Outside a task it runs after the design is approved and before `rules/skills/writing-plans.md`; it starts automatically once the design is saved, and the implementation plan starts the same way once the test plan is saved. Inside a task the order is kept by `flow`, and the `test-plan` work package says when to skip the stage: a plan of a single task gets no separate test plan (`flow skip test-plan --reason "combined: …"`, the cases go into the plan as its `## Тест-кейсы` section). Read `rules/base/testing.md` and `rules/base/test-execution-policy.md` first; the layer table in `testing.md` decides scope.

**Skip Stage A entirely** when the change has no test-worthy layer: Markdown-only edits, components, thin repositories/API clients, pure mappers. Where a test cannot be written, planning one is pointless. Record one line in the implementation plan: «План тестов не требуется: <причина>».

"Every function has a test" applies only inside the layer table: every unit in scope is covered, and every exclusion is named with its reason. Do not widen the table from a generic TDD checklist.

## Small task: one combined document

When the implementation plan will consist of a **single task** (one `### Task N`, one item of the plan), do not run two approval cycles. Write **one** document, the implementation plan, with the test plan as its first part, and approve it once.

- **Decide at the start of Stage A.** The task is small when the design (or the roadmap step) yields one plan item. If drafting shows more than one task, stop and fall back to the two-stage process below.
- **Structure:** the plan's header sections (goal, architecture, file map) first, then `## Тест-кейсы` with the Stage A content (`## R*` requirement headings, case cards, «Не покрываем», «Сигналы дизайна»), then the single `### Task 1: …`, which references the case IDs, shows their test code before the implementation and follows TDD (`rules/skills/writing-plans.md`).
- **The Stage A rules still apply to the `## Тест-кейсы` section:** behavior only, no code or mock setup inside the cards; test code lives only in the task.
- **One draft, one review loop, one approval:** draft in `tmp/drafts/<feature>-plan.md`, review with `doc-review --type=plan` (3 iterations) and add to `--focus` the six-point test-plan check for the `## Тест-кейсы` section (spec coverage, layers, branches, tautology, behavior not implementation, anti-patterns). Approval per `rules/skills/document-approval.md`.
- **Storage:** the plan path only (`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`, or the step folder in a roadmap); no `-tests.md` file. Roadmap state: `testPlanPath` stays `null`.
- **If the change has no test-worthy layer,** nothing changes: no `## Тест-кейсы` section, one line «План тестов не требуется: <причина>».

## Design order

1. **Unit** — every in-scope unit from the layer table: services with branching, guards, validators, fallback and error-handling branches, frontend stores/services/helpers.
2. **Integration** — only where a layer requires it (repositories with query logic against a real database).
3. **E2E** — fast e2e with a mocked API for pages; backend e2e for HTTP contract and authorization; full-stack only for cross-system scenarios; Storybook e2e for a UI-kit library. When a page or state has a mockup, add a case tagged `[e2e, скриншот]` for each mockup state (reference image, viewport, tolerance); see `rules/base/testing.md` → "Visual e2e against mockups".

## Before drafting: check the runners

For each layer you plan to use, check that it has a runner and a scoped command. This check is the author's step and does **not** appear in the document. A gap follows `rules/base/testing.md` → "Missing Test Infrastructure": add a preparatory task to the implementation plan or stop; never drop the test or silently fall back to a weaker layer.

## Document

Inside a task the target path comes from `flow next`; outside a task store at `docs/superpowers/plans/YYYY-MM-DD-<feature>-tests.md` after approval. **Write it in Russian** — see `rules/base/workflow-and-misc.md` → "Documentation Language"; test IDs, layer names, and identifiers stay as-is. The document is meant to be read by a person, so keep it scannable: no separate matrix, no per-case boilerplate. Sections:

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

Inside a task `flow submit` runs the Codex review (`kit:doc-review`, `--type=test-plan`, 3 iterations, profile from `.claude/dev-conventions.json`) before the document is shown to the user; the six-point check lives in the `doc-review` skill. Outside a task do it yourself: self-check the draft first (every spec requirement has an `## R*` heading; every case has Дано / Когда / Тогда / Ловит and a layer tag; IDs are numbered continuously; no placeholders; no test code or mock setup; one behavior per case; each case passes the `return mockResult` tautology check), then run `/doc-review <draft> --type=test-plan --max=3 --profile=<P> --focus="<inputs>"` with the profile `codex.review.profile` → `codex.profile` → `codex` and the approved design spec, `rules/base/testing.md`, `rules/base/test-execution-policy.md` and `testing-anti-patterns.md` as inputs. Fix every critical/high finding or reject it with a reason in the iteration note; at the limit with open major findings add a «Не сошлись» block at the top. If `doc-review` or the `codex` CLI is unavailable, follow `rules/base/workflow-dependencies.md`; never fall back to a Claude subagent. Approval: `rules/skills/document-approval.md`.

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
| Sending a draft to the reviewer without the self-check | Run the mechanical self-check first |
