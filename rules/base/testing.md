# Testing Philosophy

These rules define what to test and how to assert. The execution order is in `rules/base/test-execution-policy.md`.

## Scope

| Layer | Unit test? |
|---|---|
| Services with branching/orchestration logic | **Yes** |
| Guards, validation, fallback and error-handling branches | **Yes** |
| UI components | **No** — cover delegated behavior through the service/store layer. Exception: a shared UI-kit library with Storybook — cover component behavior with Playwright e2e over Storybook stories (stories are the fixtures, specs live in a separate `*-e2e` project) |
| Markdown files (rules, skills, docs, plans, roadmaps) | **No** — no tests and no grep-style checks; verify by reading the diff |
| Repositories/DAOs with query logic (filters, `include`/joins, raw SQL, transactions, conditional writes, branches) | **Yes, integration** — a test against a real database, never a mocked client; required for full TDD |
| Thin repositories (plain create/read/update/delete wrappers with no logic of their own) | **No** — cover through the calling service |
| Application pages and user flows | **Yes, e2e** — a fast e2e with a mocked API for page behavior; a full-stack e2e only for cross-system scenarios |
| Thin outbound API clients | **No** — test how the caller uses the result |
| Pure row/payload → domain mappers (only field assignment/`?? default`) | **No** |

A UI-kit library never gets unit tests for components. Its behavior (clicks, input, keyboard, aria states) is covered by e2e specs that open Storybook stories by URL; this is the only component-level testing scenario for it.

Skipped layers must still be covered indirectly where their behavior affects a tested caller. The exclusions above are specific; other decision points default to unit tests.

## Coverage

Cover the happy path and every meaningful failure, validation, fallback, timeout, upstream-error, non-`Error` rejection, or unexpected-result branch present in the code. A `try/catch`, null-check, or conditional early return normally means at least two cases.

For async dependencies, cover timeout and upstream failure when the code has behavior for them. Do not add tests for branches the code does not implement.

## Missing Test Infrastructure

If the layer a change needs has no test infrastructure in the project (no integration target for a repository with query logic, no fast e2e for a page, no scoped run command), stop. Say which layer is blocked, state that full TDD is impossible for it without the infrastructure, and propose a preparatory task that adds it.

Do not silently fall back to a weaker layer: covering a repository only through its service with a mocked client, or skipping the page test. Fall back only when the user explicitly chooses it, and record that choice in the plan.

## Assertions

- Never index mock history (`mock.calls[0][1]`); use `toHaveBeenCalledWith` or `toHaveBeenNthCalledWith`.
- Never assert logger/`console` calls. Assert observable behavior: return value, resolution/rejection, thrown error, or calls that must or must not occur. If logging is the only effect, accept the weaker guard.
- Apply the tautology check: delete a test if it would pass with the method replaced by `return mockResult` or with its logic hardcoded.
- Reuse shared fixtures/mocks before creating new ones.
- Test data and test values (seed rows, fixture literals, timeouts of a test config) are defined in the test file or in a test-support file next to it, as local named constants. Do not extract them into a `*.constants.ts` file — those are for production constants.
- In mixed-stack repos, use a DOM environment only for browser suites; keep backend suites on Node.
- Test descriptions use the user's communication language (default: Russian).
- Cast mocks/fixtures as `unknown as Type`, never `as any`.
- Playwright: to check that a disabled element ignores a click, use `locator.dispatchEvent('click')`, never `click({ force: true })` (`playwright/no-force-option`). `force` bypasses actionability checks; `dispatchEvent` sends the event directly and still proves the element does not react.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Spec for a component, thin repository, thin client, or pure mapper | Skip it; cover the caller where applicable. A UI-kit library with Storybook is the exception: its components get e2e specs over stories (see Scope) |
| Tests or grep-style checks for a Markdown edit | Skip them; read the diff |
| Repository with query logic covered only through a service test with a mocked client | Integration test against a real database; if the project has none, stop and insist on adding it |
| Happy path only | Add meaningful negative/validation/failure branches |
| `expect(fn.mock.calls[0][0])` | Use the matching call matcher |
| Logger assertion | Assert surrounding behavior |
| `mockObject as any` | Use `mockObject as unknown as Type` |
| Playwright `click({ force: true })` on a disabled element | Use `dispatchEvent('click')` |
| Seed/fixture values extracted to a `*.constants.ts` file | Keep them as local named constants in the test or test-support file |
