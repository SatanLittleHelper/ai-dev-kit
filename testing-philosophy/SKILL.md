---
name: testing-philosophy
description: Use when writing, reviewing, or deciding whether to write unit tests — what to cover, what never to cover, how to assert, and when tests actually run in the workflow.
---

# Testing Philosophy

## Overview

This developer's personal testing standards, independent of stack or test runner (examples use Vitest, but every rule ports directly to Jest/pytest/etc.). Two concerns, kept separate: **what makes a test worth keeping** (this file) and **when tests run at all** (Execution Timing below) — conflating them leads to either skipping coverage that's actually required, or running tests at points in the workflow where they just add noise.

## Quick Reference

| Concern | Rule |
|---|---|
| What layers get unit tests | Business-logic services — yes. Components, repositories, thin API-client wrappers, pure mappers — no (see table below) |
| Coverage shape | Happy path AND negative/failure/validation branches — not happy-path-only |
| Assertion style | `toHaveBeenCalledWith`/`toHaveBeenNthCalledWith` — never index into `mock.calls[n][m]` |
| Logger/console | Never assert on it — assert the observable behavior around it instead |
| The tautology check | If the test still passes with the method body replaced by `return mockResult`, delete it |
| Who writes tests | A separate pass/agent from the one that wrote the production code — not bundled into the same task |
| When tests run | Only on explicit request, after all planned code changes in the task are done — never automatically after an edit |

## What Gets Unit Tests, and What Doesn't

| Layer | Unit test? | Why |
|---|---|---|
| Services with real branching/orchestration logic | **Yes** | This is where behavior actually varies — the layer worth a regression guard |
| UI components (Angular/React/Vue/etc.) | **No** | Component tests are consistently the lowest-value, highest-maintenance tier in practice; skip even when the component has conditional logic — that logic is exercised through the service/store layer it delegates to |
| Repository/DAO classes (thin DB-query wrappers) | **No** | Cover their effect through the higher-level service test that calls them, not in isolation |
| Thin outbound API-client wrappers (a method that's just `await client.post(...)`) | **No** | Same reasoning — the value is in how the caller uses the result, not in re-testing the HTTP call shape |
| Pure mappers (row/payload → domain type, no branching beyond `?? default`) | **No** | Correctness is already guaranteed by the type system's structural check, not by a runtime assertion that would just restate the mapping |
| Everything else with a decision point (guards, validation, fallback logic, error-handling branches) | **Yes** | Default to testing it — the exclusions above are a specific, short list, not a general "skip if boring" license |

**A skipped layer must be covered indirectly.** "No unit test for the repository" doesn't mean the repository's behavior goes unverified — it means the test that exercises it lives one layer up, on the service that calls it (mock the repository there, assert the service's behavior across the repository's return values: found, not-found, whatever branches the service reacts to).

## Coverage Shape: Negative Scenarios Are Not Optional

Treat failure branches, validation branches, fallback logic, and integration error handling as a default part of coverage — not something added only if there's time left. A method with a try/catch, a null-check, or a conditional early return has at least two test cases by construction, not one.

For anything integrating with an async dependency (a queue, an external API, a timer): cover timeout, upstream failure, a non-`Error` rejection, and an unexpected result shape where the code has a branch for it — not just the success path.

## Assertion Style

**Never index into a mock's call history** (`mock.calls[0][1]`, `mock.mock.calls[n][m]`). Always use the matcher built for this: `toHaveBeenCalledWith(...)` for the last/only call, `toHaveBeenNthCalledWith(n, ...)` for a specific call in a sequence. Indexing is both harder to read and silently wrong when call order shifts.

**Never assert on a logger or `console` call**, including in a catch-and-log branch whose only observable effect (besides the log itself) is that the surrounding call resolves without throwing. Assert the behavior around the log instead: the promise still resolves, the return value reflects the failure path, a sibling write that *shouldn't* have happened didn't happen. If a branch truly produces no effect besides logging, that's a legitimately weaker regression guard — accept it rather than reaching for a logger-mock assertion as a substitute for real coverage.

## The Tautology Check

Before keeping a test, ask: would this still pass if the method body were replaced with `return mockResult`? Concretely forbidden shapes:
- Asserting only that a call returns whatever its own mock was set to return (`repo.find.mockResolvedValue(null)` → `expect(await service.find()).toBeNull()`, with nothing else asserted)
- Asserting only built-in language coercion (`Number('99') === 99`)
- Any test where deleting the method's real logic and hardcoding the expected return wouldn't break it

A test earns its place by asserting something the *logic* produces — a downstream call with the right arguments, a branch-dependent return shape, an exception type tied to a specific input.

## Execution Timing

Two separate questions, both answered here:

**Who writes the tests:** the agent/pass that writes production code for a task does not also write that task's tests. Route test-writing to a separate pass — a dedicated test-writing agent, or an explicit follow-up task in the same plan. This isn't optional by default: new or changed behavior gets test coverage as part of the work, just not authored by the same hands that wrote the implementation.

**When tests run:** never automatically after an edit. Run them only on explicit user request, and only once all planned code changes for the task are already written — not per-file, not per-task inside a multi-step plan. A multi-task plan gets exactly one test run, at the end, covering everything.

**Exception — code review may write tests directly.** The "separate pass" rule above has exactly one carve-out: a review pass may add or update tests directly when it finds behavior changed, coverage missing, and no separate test-writing task was planned for it. This is the one case where reviewing and writing tests happen in the same pass.

## Test Environment & Fixture Reuse

**Environment config, when the runner supports per-suite environments:** in a mixed-stack repo, configure a DOM-like environment (e.g. jsdom) only for the apps that actually run in a browser; keep everything else (backend services) on the plain Node environment. Mixing needlessly costs startup time across the whole suite and can surface environment-specific bugs (see the jsdom/`fetch` gotcha in `angular-personal-conventions`) in code that never needed a DOM in the first place.

**Reuse fixtures/mocks before writing new ones.** Before hand-rolling a mock, check whether your project's shared testing-utilities package already has one — look for a `create-*` naming convention nearby. Duplicated ad hoc mocks drift from each other and from the real shape they're mocking.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Writing a `.spec` for a component/repository/mapper "for completeness" | Skip it — see the layer table. Coverage of that behavior belongs one layer up |
| `expect(fn.mock.calls[0][0]).toBe(x)` | `expect(fn).toHaveBeenCalledWith(x)` |
| `expect(logger.error).toHaveBeenCalledWith(...)` in a catch-and-log test | Assert the surrounding observable behavior instead (return value, resolves without throwing, a sibling call that didn't fire) |
| Only a happy-path test for a method with a try/catch or validation branch | Add the failure-branch test — it's not optional extra credit |
| Running the test suite after every file edit mid-task | Wait until the whole task's code is written, then run once, on request |
| Same agent writes the feature and its tests in one pass | Split into a separate test-writing pass |
| Under deadline/reviewer pressure, adding tests for a layer this skill excludes "just to show full coverage" | "Full coverage" means full coverage *per this convention* — a repository/API-client/component with no spec file is the correct, complete state, not a gap |
