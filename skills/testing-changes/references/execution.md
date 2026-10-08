# Execution

Run the tests in plan order. For every test record the actual result and its evidence next to the expected one. Artifacts of the run go to `tmp/reports/<run>/` (`<run>` = `YYYY-MM-DD-HHMM`).

## `curl` (api)

- Secrets come from `.env` into the command without printing them, for example `T=$(grep '^NAME=' .env | cut -d= -f2-)` and `-H "x-token: $T"`.
- Capture status and body together: `curl -s -o tmp/reports/<run>/T1.body -w '%{http_code}' <url> ...`, then read the body file.
- Compare status, body fields and headers with the expected result of the plan.

## Playwright (web)

- Work from `browser_snapshot` (accessibility tree); use screenshots as evidence, saved under `tmp/reports/<run>/` (Playwright can only write inside the project directory).
- The backend is tested through the page: read `browser_network_requests` for the API calls the page made (status, request and response bodies) and `browser_console_messages` for errors. A page that looks right while its API call failed is a failed test.
- Avoid actions that open browser dialogs (`alert`, `confirm`); if one appears, dismiss it with `browser_handle_dialog`.

## Max bot and Max mini app (max-bot, max-miniapp)

- Only the web version of Max (`testing.maxWebUrl`) in Playwright. The Max login was checked in the environment phase; if the login screen appears mid-run, pause and repeat the login steps from `environment.md` (visible window on the same profile).
- Bot: open the chat named in `testing.maxBotName` (ask the user once if it is not configured), perform the steps, and read the bot's messages and buttons from the snapshot. Check the rendered text, not only that a message arrived: broken formatting, literal entities and missing buttons are failures.
- Mini app: open the bot chat, press the button that opens the mini app, interact inside it, and check its network requests as in the `web` section.

## Existing e2e specs (e2e)

- Run them after the apps are up, with the exact command from the plan, output to `tmp/reports/<run>/<id>.log`; read the tail and the runner's summary.
- Expected is "all selected specs pass". Actual is the list of failing specs with their assertion messages; keep the paths of runner artifacts (screenshots, traces, videos) for the report.
- Rerun only when the runner itself crashed (not an assertion failure), once, and record that you did. Never rerun a failing assertion to get a pass.

## Recording

Per test keep: status, the actual result, evidence (`curl` status and body, snapshot excerpt or screenshot path, console/network findings), and for failures the last lines of the relevant `tmp/logs/<app>.log`.

## Failures

- A failed test does not stop the run: continue with the rest.
- A test that depends on a failed one is `пропущен` with the reason.
- Do not fix code, retry endlessly, or change the plan during the run. A needed change to the plan means: stop, tell the user, go to Teardown.

## Side effects

Do the cleanup steps written in the plan after each test or at the end of the run. Anything you could not undo (rows, messages, issues in external systems) goes into the report's side-effects section.
