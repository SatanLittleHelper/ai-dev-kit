# Test Plan

## 1. Find the base and the diff

- Base: the branch this branch was created from in this session, if known; otherwise `main`. Several candidates and no way to tell: ask once with `AskUserQuestion`.
- Diff: `git diff <base>...HEAD` plus uncommitted work (`git diff HEAD` and `git status --short` for untracked files). Read the changed files, not just the stat.

## 2. Find the task documents

1. Ticket id: the first match of `[A-Z]+-[0-9]+` in the branch name (`git branch --show-current`).
2. Roadmap step: `docs/*/roadmap-state.json` and step folders `docs/*/steps/*/` that mention the ticket. Read the step PRD, design and plan there.
3. Otherwise search `docs/` for the ticket id.

No documents is fine: say so in the plan. Take expected results from the documents' requirements and success criteria. Where a document and the code disagree, record it under "Open questions" in the plan instead of choosing silently.

## 3. Turn changes into tests

For every changed unit write: observable behavior before → after, inputs that matter, failure branches. Then choose tests:

- the happy path of each changed behavior;
- each validation, error or edge branch the diff adds or touches;
- one regression check per neighboring behavior that shares the changed code;
- nothing for a pure refactor with no observable change (list it under "Not covered").

Unit tests, lint and build are not part of this plan: they belong to the project's verification step.

### Existing e2e tests

If an automated e2e suite already covers a changed behavior, it goes into the plan as a test of kind `e2e`, next to the manual ones.

1. Find the suites: `testing.e2e` from the config; otherwise `npx nx show projects --with-target e2e`, folders and projects named `*-e2e` or `e2e`, `playwright.config.*`, `cypress.config.*`, and `test:e2e` scripts in `package.json`.
2. Pick the specs: read the spec files and titles, and match them against the changed behaviors (endpoints, routes, components, messages). Select only the specs that exercise a changed behavior.
3. Write each selection as a test: steps are the exact command, narrowed to the selected specs when the runner allows it; the expected result is "all selected specs pass", with the behaviors they cover named.
4. A manual test that an e2e spec fully covers may be dropped; say so in the plan.
5. No e2e suite found: write "e2e: not found" under "Not covered".

## 4. Classify every test

Match each changed path against `testing.surfaces` (glob → kind). Without config, infer from the code (HTTP controllers → `api`, Angular/React app → `web`, Max bot or mini app → `max-bot` / `max-miniapp`); unsure: ask.

| Kind | Tool | Rule |
|---|---|---|
| `api` | `curl` | status, body, headers |
| `web` | Playwright | the backend is covered through the page's own network requests |
| `max-bot`, `max-miniapp` | Playwright on the web version of Max | never a desktop or mobile client |
| `e2e` | the project's own e2e command | an existing automated spec that covers a changed behavior |

## 5. Write the plan (Plan Mode)

1. `EnterPlanMode`.
2. Write the plan in Russian with the template below. Every test has preconditions and data, numbered steps, an expected result, side effects and cleanup. Secrets appear as variable names, never values.
3. `ExitPlanMode` (the user reviews it in Plannotator). Changes requested: revise and call `ExitPlanMode` again. Tests start only after approval.

```markdown
# Тест-план: <тикет> <название>

**Ветка:** `<ветка>` (база: `<база>`)
**Документы задачи:** <пути или «нет»>

## Что меняется
<2-5 строк: поведения, а не файлы>

## Приложения к запуску
<все приложения из конфига; отметить, какие нужны тестам>

## Предупреждения
<профиль Playwright, вход в Max, побочные эффекты, внешние сервисы>

## Открытые вопросы
<расхождения документов и кода или «нет»>

## Тесты

### T1. <название> (<api | web | max-bot | max-miniapp | e2e>)
- **Предусловия и данные:** <пользователь, тикет, переменные окружения>
- **Шаги:**
  1. <конкретная команда curl или действие в браузере>
  2. ...
- **Ожидаемый результат:** <статус, тело, текст в интерфейсе, отсутствие ошибок в консоли>
- **Побочные эффекты и уборка:** <записи в БД, сообщения в Max, как откатить>

## Не проверяется
<что и почему>
```

## 6. Save after approval

- Task belongs to a roadmap step: `docs/<feature-slug>/steps/<step-slug>/YYYY-MM-DD-<ticket>-test-plan.md`.
- Otherwise: `tmp/test-plans/YYYY-MM-DD-<branch>-test-plan.md`.

Never commit the plan unless the user asks.
