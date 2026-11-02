# Writing Test Plans — Stage A

Planning is two stages, each with its own document and its own approval cycle:

- **Stage A — test plan** (this file): *what* each test verifies and *why*, as behavior, with no code. Unit first, then integration, then e2e.
- **Stage B — implementation plan** (`rules/skills/writing-plans.md`): test code for the Stage A test IDs, then the minimal implementation that makes them pass.

There is no `superpowers:*` skill for Stage A; this file owns the process. The execution phase (red → verify red → green → refactor) is unchanged and lives in `rules/base/test-execution-policy.md`.

## When it runs and when it is skipped

Runs after the design is approved and before `rules/skills/writing-plans.md`. It starts automatically once the design is approved and saved; and once the test plan is approved and saved, Stage B starts automatically the same way. Do not ask for confirmation between stages. Read `rules/base/testing.md` and `rules/base/test-execution-policy.md` first; the layer table in `testing.md` decides scope.

**Skip Stage A entirely** when the change has no test-worthy layer: Markdown-only edits, components, thin repositories/API clients, pure mappers. Where a test cannot be written, planning one is pointless. Skip without a Plan Mode cycle and record one line in the implementation plan: «План тестов не требуется: <причина>».

"Every function has a test" applies only inside the layer table: every unit in scope is covered, and every exclusion is named with its reason. Do not widen the table from a generic TDD checklist.

## Design order

1. **Unit** — every in-scope unit from the layer table: services with branching, guards, validators, fallback and error-handling branches, frontend stores/services/helpers.
2. **Integration** — only where a layer requires it (repositories with query logic against a real database).
3. **E2E** — fast e2e with a mocked API for pages; backend e2e for HTTP contract and authorization; full-stack only for cross-system scenarios; Storybook e2e for a UI-kit library.

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

The author is the main agent, drafting in native Plan Mode. The user sees only the document that came out of this loop, through `ExitPlanMode`.

1. Draft the document in the Plan Mode file.
2. Spawn a read-only reviewer subagent (`Explore`-class; cheap model unless the user chose otherwise) with the full contents of `rules/skills/test-plan-reviewer.md` as its prompt plus the inputs listed there. The subagent does not read repository rules on its own.
3. Fix every `[major]` finding in the draft; apply `[minor]` ones when cheap. Do not argue with the reviewer inside the document.
4. Re-run the reviewer. Stop when it ends with `VERDICT NO_MAJOR_ISSUES`, or after **3 review iterations**.
5. If the limit is reached with major findings left, still go to `ExitPlanMode`, but add a «Не сошлись» block at the top: each remaining major finding and the author's position.

After approval, save to the target path. Stage B starts a new Plan Mode cycle with a fresh file that does not contain this document.

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
| Reviewer loop with no limit | Stop at `NO_MAJOR_ISSUES` or after 3 iterations, with a «Не сошлись» block |
| Appending the implementation plan to the approved test plan's Plan Mode file | One document per Plan Mode cycle; start Stage B in a fresh file |
