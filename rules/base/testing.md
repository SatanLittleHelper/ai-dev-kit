# Testing Philosophy

These rules define what to test and how to assert. The execution order is in `rules/base/test-execution-policy.md`.

## Scope

| Layer | Unit test? |
|---|---|
| Services with branching/orchestration logic | **Yes** |
| Guards, validation, fallback and error-handling branches | **Yes** |
| UI components | **No** — cover delegated behavior through the service/store layer |
| Thin repositories/DAOs | **No** — cover through the calling service |
| Thin outbound API clients | **No** — test how the caller uses the result |
| Pure row/payload → domain mappers (only field assignment/`?? default`) | **No** |

Skipped layers must still be covered indirectly where their behavior affects a tested caller. The exclusions above are specific; other decision points default to unit tests.

## Coverage

Cover the happy path and every meaningful failure, validation, fallback, timeout, upstream-error, non-`Error` rejection, or unexpected-result branch present in the code. A `try/catch`, null-check, or conditional early return normally means at least two cases.

For async dependencies, cover timeout and upstream failure when the code has behavior for them. Do not add tests for branches the code does not implement.

## Assertions

- Never index mock history (`mock.calls[0][1]`); use `toHaveBeenCalledWith` or `toHaveBeenNthCalledWith`.
- Never assert logger/`console` calls. Assert observable behavior: return value, resolution/rejection, thrown error, or calls that must or must not occur. If logging is the only effect, accept the weaker guard.
- Apply the tautology check: delete a test if it would pass with the method replaced by `return mockResult` or with its logic hardcoded.
- Reuse shared fixtures/mocks before creating new ones.
- In mixed-stack repos, use a DOM environment only for browser suites; keep backend suites on Node.
- Test descriptions use the user's communication language (default: Russian).
- Cast mocks/fixtures as `unknown as Type`, never `as any`.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Spec for a component, thin repository/client, or pure mapper | Skip it; cover the caller where applicable |
| Happy path only | Add meaningful negative/validation/failure branches |
| `expect(fn.mock.calls[0][0])` | Use the matching call matcher |
| Logger assertion | Assert surrounding behavior |
| `mockObject as any` | Use `mockObject as unknown as Type` |
