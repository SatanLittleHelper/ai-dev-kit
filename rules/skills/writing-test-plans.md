# Writing Test Plans — Stage A

Planning is two stages, each with its own document and its own approval cycle:

- **Stage A — test plan** (this file): *what* each test verifies and *why*, as behavior, with no code. Unit first, then integration, then e2e.
- **Stage B — implementation plan** (`rules/skills/writing-plans.md`): test code for the Stage A test IDs, then the minimal implementation that makes them pass.

There is no `superpowers:*` skill for Stage A; this file owns the process. The execution phase (red → verify red → green → refactor) is unchanged and lives in `rules/base/test-execution-policy.md`.

## When it runs and when it is skipped

Runs after the design is approved and before `rules/skills/writing-plans.md`. Read `rules/base/testing.md` and `rules/base/test-execution-policy.md` first; the layer table in `testing.md` decides scope.

**Skip Stage A entirely** when the change has no test-worthy layer: Markdown-only edits, components, thin repositories/API clients, pure mappers. Where a test cannot be written, planning one is pointless. Skip without a Plan Mode cycle and record one line in the implementation plan: «План тестов не требуется: <причина>».

"Every function has a test" applies only inside the layer table: every unit in scope is covered, and every exclusion is named with its reason. Do not widen the table from a generic TDD checklist.

## Design order

1. **Unit** — every in-scope unit from the layer table: services with branching, guards, validators, fallback and error-handling branches, frontend stores/services/helpers.
2. **Integration** — only where a layer requires it (repositories with query logic against a real database).
3. **E2E** — fast e2e with a mocked API for pages; backend e2e for HTTP contract and authorization; full-stack only for cross-system scenarios; Storybook e2e for a UI-kit library.

For each layer state explicitly: needed or not, and why. A missing layer infrastructure follows `rules/base/testing.md` → "Missing Test Infrastructure": add a preparatory task or stop; never drop the test or silently fall back to a weaker layer.

## Document

Store at `docs/superpowers/plans/YYYY-MM-DD-<feature>-tests.md` after approval (inside a roadmap step: the step folder, next to the plan). **Write it in Russian** — see `rules/base/workflow-and-misc.md` → "Documentation Language"; test IDs, layer names, and identifiers stay as-is. Sections:

1. **Спека и цель** — link to the approved design, one-sentence goal.
2. **Инфраструктура** — which layers have a runner and a scoped command, which do not; a gap becomes a preparatory task or a stop.
3. **Матрица покрытия** — spec requirement → test IDs. A requirement with no test needs a stated reason.
4. **Кейсы по слоям** — unit, then integration, then e2e. Each case:
   - **ID** (`U1`, `I1`, `E1`) and a name that states the behavior;
   - **Given / When / Then** in observable terms (return value, rejection, thrown error, calls that must or must not happen);
   - **Какую регрессию ловит** — the concrete break this case would catch;
   - **Tautology check** — why it fails if the implementation is replaced with `return mockResult`;
   - **Моки и фикстуры** — what is mocked and why, which shared fixtures are reused; no mock configuration.
5. **Не покрываем** — excluded units/branches with the reason.
6. **Сигналы дизайна** — places where a test is hard to describe or needs "mock everything" (see TDD's "Test hard = design unclear"); these go back to the spec, not around it.

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
| Requirement with no test ID and no stated reason | Fix the coverage matrix |
| Showing the user a draft before the review loop | Run the loop first; the user sees the result |
| Reviewer loop with no limit | Stop at `NO_MAJOR_ISSUES` or after 3 iterations, with a «Не сошлись» block |
| Appending the implementation plan to the approved test plan's Plan Mode file | One document per Plan Mode cycle; start Stage B in a fresh file |
