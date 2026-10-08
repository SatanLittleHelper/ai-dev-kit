# Environment

## Preconditions

1. Infrastructure must be reachable, not just configured. Run `testing.infraCheck`: a command that exits non-zero when the database (and any other required service) is not accepting connections, for example `pg_isready -h localhost -p 5432` or `nc -z localhost 5432`. A command that only validates configuration (`docker compose config`, `make local-check` that wraps it) proves nothing and does not count. Not configured: take the database host and port from the project's DB URL variable in `.env` (for example `DATABASE_URL`; strip the surrounding quotes, never print the password), probe it with `nc -z <host> <port>`, show the probe in the test plan, and offer to save it as `testing.infraCheck`. Probe failed: stop and name what is down. Never start infrastructure.
2. Stale run: if `tmp/test-run-state.json` exists, check each entry (`kill -0 -- -<pgid>`). Live processes left: offer to stop them first (Teardown below), then continue.

## Project config (`.claude/dev-conventions.json`)

```json
{
  "testing": {
    "infraCheck": "nc -z localhost 5432",
    "maxWebUrl": "https://web.max.ru",
    "maxBotName": "<bot title in the Max chat list>",
    "apps": [
      { "name": "miniapp-gate", "start": "npm run start:miniapp-gate", "ready": { "port": 3003 } },
      { "name": "max-bot", "start": "npm run start:max-bot", "ready": { "log": "standalone mode" } }
    ],
    "surfaces": [
      { "paths": "apps/miniapp-gate/**", "kind": "api" },
      { "paths": "apps/miniapp/**", "kind": "max-miniapp" },
      { "paths": "apps/max-bot/**", "kind": "max-bot" }
    ],
    "e2e": [
      { "paths": "apps/miniapp-e2e/**", "command": "npx nx run miniapp-e2e:e2e" }
    ]
  }
}
```

`ready` is one of `{ "port": N }`, `{ "url": "..." }`, `{ "log": "<substring>" }`. Never invent ports or log lines. An app without a known `ready`: read its entry point for the port (`PORT`, `listen`) or its startup log for a ready line, and put that proposal into the plan's "Apps to start" section for the user to confirm. No secrets in the config.

`e2e` (optional) lists existing automated e2e suites: `{ "paths": "apps/miniapp-e2e/**", "command": "npx nx run miniapp-e2e:e2e" }`. See `test-plan.md` § 3 for how they are used.

No `testing.apps`: list the start scripts with `node -p "Object.keys(require('./package.json').scripts).filter(k => k.startsWith('start:')).join('\n')"`, show them in the test plan, and offer to save the result into the config (write only after the user agrees).

## Playwright MCP and the Max login

Only when the plan has `web`, `max-bot` or `max-miniapp` tests.

1. Effective config: run `claude mcp get playwright` (resolves for the current working directory, so a worktree is handled). If that command is unavailable, read `.mcp.json` and the `projects.<cwd>.mcpServers.playwright` entry of `~/.claude.json` (print only that entry).
2. Required: a persistent profile, i.e. `--user-data-dir <path>` in the args with no `--isolated`, and `--headless`. Either missing: show the user the exact change (remove the old entry, then for example `claude mcp add playwright -- npx @playwright/mcp@latest --headless --user-data-dir ~/.cache/playwright-mcp-profile`), apply it only after the user agrees and never while a Playwright test is running, and tell them to restart Claude Code. Until then continue in the mode the MCP already has.
3. Login (headless by default): open `testing.maxWebUrl` (default `https://web.max.ru`) with Playwright and take a snapshot. The chat list visible means logged in: go on. The login screen (phone number prompt, "Войти по QR-коду") means not logged in, and a headless browser cannot show it. Open a visible window only for the login:
   1. `browser_close` to release the profile lock.
   2. Open a visible browser on the same profile outside MCP: `npx playwright open --user-data-dir <profile-dir> <maxWebUrl>`. If that flag is unavailable, run a short script with `playwright-core`: `chromium.launchPersistentContext(<profile-dir>, { headless: false })`, `page.goto(<maxWebUrl>)`, keep the window open.
   3. Ask the user to log in themselves and close the window; wait for their confirmation.
   4. Reopen Max in the MCP browser and snapshot to confirm the chat list is visible.
4. Login lost although a profile is configured: the likely cause is the profile directory being locked by another browser instance. Report it; do not retry in a loop.

## Start the apps

Start every app from `testing.apps` (or the discovered `start:*` list): the whole monorepo, including apps the tests do not touch. The test plan lists them, and approving the plan approves the list; never ask which ones to start. Per app:

1. Readiness before start: if the check already passes, the app belongs to someone else. Record it with `"owned": false` and do not start it.
2. Start it detached in its own process group, output to a log (`mkdir -p tmp/logs` once):

```bash
perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' -- npm run start:miniapp-gate > tmp/logs/miniapp-gate.log 2>&1 < /dev/null &
echo $!
```

`setsid` makes the process a group leader, so its pid equals its pgid. Use the project's command exactly; never override env vars.

3. Write the entry to `tmp/test-run-state.json` immediately (create the file on the first app):

```json
{
  "startedAt": "<ISO-8601>",
  "apps": [
    { "name": "miniapp-gate", "command": "npm run start:miniapp-gate", "pid": 0, "pgid": 0, "ports": [3003], "log": "tmp/logs/miniapp-gate.log", "owned": true }
  ]
}
```

4. Wait for readiness with Monitor (never a `sleep` chain): port: `until nc -z localhost <port>; do sleep 2; done`; url: `until curl -s -o /dev/null <url>; do sleep 2; done`; log: `until grep -q "<substring>" tmp/logs/<app>.log; do sleep 2; done`. Not ready within a few minutes: stop the run, show the tail of the log, go to Teardown.

## Teardown (after the report is approved)

The apps stay up while the user reviews the report, so a re-check is possible. Run teardown when the user approves the report (the Plannotator "Done"), when the review is dismissed, when the user cancels, and right away when the run aborts before a report exists (for example an app fails to start). Never end the session with owned apps still running.

For every `owned: true` entry in the state file:

1. `kill -TERM -- -<pgid>`.
2. Wait with Monitor until `kill -0 -- -<pgid>` fails. Still alive after the Monitor timeout: `kill -KILL -- -<pgid>`.
3. Check each recorded port: `lsof -iTCP:<port> -sTCP:LISTEN -P` must print nothing. Something still listens: show the process and ask the user; do not kill unknown processes.

`owned: false` entries are left alone. Delete the state file once every owned entry is confirmed stopped. Keep the logs until the document cleanup below. Killing only the parent `npm`/`nx` process is not enough: the child `node` processes survive and keep the ports.

## Cleanup of documents (only after the report is approved)

Runs after the apps are confirmed stopped, and only when the user approved the report (Plannotator "Done"). Not on a dismissed review, a cancel or an abort: the plan stays for a re-run.

1. Delete the test plan file (the path from the report's «Тест-план» field, saved in Phase 1-2). Say in one line which file was deleted. A missing file is not an error.
2. Ask the user with `AskUserQuestion` whether to delete the test report too (options: «Удалить» / «Оставить»). Delete it only on «Удалить». The default is to keep it: no answer means keep.
3. Delete the temp files of this run: the logs of the apps this run started (`tmp/logs/<app>.log` for every `owned: true` entry). Logs of `owned: false` apps were not written by this run: leave them.
4. Evidence of this run (`tmp/reports/<run>/`: response bodies, screenshots, test logs) is referenced by the report. Delete it together with the report when the user chose «Удалить»; if the report stays, the evidence stays too.
5. Remove `tmp/logs`, `tmp/reports`, `tmp/test-plans` if they are now empty. Do not touch anything else: `docs/` files other than these, git state. Never commit the deletions unless the user asks.
