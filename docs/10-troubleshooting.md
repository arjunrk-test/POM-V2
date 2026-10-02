# 10. Troubleshooting

Common problems, what causes them and how to fix them. Find the error message you see (Ctrl+F) and follow the fix.

## Setup and installation

### `'node' is not recognized as an internal or external command` / `npm: command not found`
Node.js isn't installed, or the terminal was opened before installing it.
**Fix:** install Node.js LTS from <https://nodejs.org>, then **close and reopen** the terminal (and VS Code).

### `Cannot find module '@playwright/test'` / `Cannot find module 'nodemailer'`
The packages aren't installed.
**Fix:** `npm ci` in the project folder.

### `Chromium distribution 'chrome' is not found at ...` / `... 'msedge' is not found ...`
The test (or the email charts) need installed Google Chrome / Microsoft Edge, and it isn't on this machine.
**Fix:** install the browser normally, or `npx playwright install chrome` / `npx playwright install msedge`.

### `process.loadEnvFile is not a function`
Node.js is too old (needs 20.12 or newer).
**Fix:** install the current Node.js LTS.

### `.\suite.bat : The term '.\suite.bat' is not recognized`
You're not in the project folder.
**Fix:** `cd` into the folder that contains `suite.bat` and `package.json`, or open the project folder in VS Code and use its terminal.

### `suite.bat` does nothing / `suite.bat is not recognized` in PowerShell
In PowerShell, files in the current folder need `.\` in front: `.\suite.bat smoke`. In Command Prompt plain `suite.bat smoke` works. On macOS/Linux use `npm run suite -- smoke`.

## `browsers.json` and suites

### `unknown browser "chorme" in test "...". Use one of: chrome, edge`
Typo in a browser name in `test-plans/browsers.json`.
**Fix:** use exactly `chrome` or `edge` (lowercase).

### `test "..." must be a non-empty array of browsers (chrome, edge)`
A test's value is empty (`[]`) or not a list (`"chrome"` instead of `["chrome"]`).
**Fix:** `"my test": ["chrome"]`.

### `Could not read ...browsers.json: Unexpected token ...` (or `...<suite>.json`)
The JSON is broken. Usual causes: a missing comma between entries, a comma after the last entry, single quotes, or a `//` comment.
**Fix:** open the file in VS Code; the error is underlined in red.

### My test runs in the wrong browser
1. `npm run test:list`: see where it actually runs.
2. Check the title in `browsers.json` is **exactly** the test's title (case, spaces, punctuation). If it doesn't match, the entry is ignored and the test uses `defaultBrowsers`.
3. If the test was renamed recently, update `browsers.json`.

### My new test doesn't run at all
- The file name must end in **`.spec.js`** and be inside `tests/`.
- If `defaultBrowsers` is `[]`, unlisted tests don't run: add the test to `browsers.json`.
- For a suite run: add the test (or its file) to the suite file.
- Check with `npm run test:list`.

### `Suite "smok" not found in ...`
No file `test-plans/suites/smok.json`. The message lists the suites that exist.
**Fix:** check the spelling; the name is the file name without `.json`.

### `Suite "smoke" lists entries that match no test in any browser:`
A title in the suite's `tests` matches no test, typically because of a typo or a renamed test.
**Fix:** copy the exact title from the test file into the suite file. If the title is right, check `browsers.json` gives the test at least one browser.

### `file "..." not found in ...\tests (paths are relative to the tests folder)`
Paths in a suite's `files` start from inside `tests/`.
**Fix:** write `"login.spec.js"`, not `"tests/login.spec.js"`; for subfolders `"employees/create.spec.js"`.

### `a suite needs at least one entry in "files" or "tests"`
Both lists are empty or missing. Add at least one file or test.

## Test failures

### `Expected: "https://.../dashboard/index"  Received: ""` on the login test
The page never loaded. The OrangeHRM demo site is a public server and is sometimes slow or down.
**Fix:** open the URL in your browser. If it's slow, re-run; consider fewer workers (`--workers=1`) so the site isn't hit by many browsers at once.

### `Timeout 30000ms exceeded` / `Test timeout of 30000ms exceeded`
A test took longer than 30 seconds, usually because it's waiting for an element that never appears.
**Fix:** look at the step it was stuck on in the report/trace. Usually the locator is wrong or the page didn't reach the expected state. If the page is genuinely slow, raise the limit for that test: `test.setTimeout(60000);` at the start of the test.

### `strict mode violation: locator(...) resolved to 2 elements`
The locator matches more than one element, and Playwright refuses to guess which one you mean.
**Fix:** make the locator more specific, e.g. `getByRole('button', { name: 'Save' })` instead of `locator('button')`, or scope it: `page.locator('form').getByRole('button', { name: 'Save' })`. Use `.first()` only if any match really is fine.

### `waiting for locator(...)` until timeout / element not found
The element isn't on the page (yet), or the locator is wrong.
**Fix:** check the page state in `test-results/<test>/error-context.md` or the trace. Try the locator in UI mode's locator picker (`npm run test:ui`).

### Test passes alone but fails when run with others
Tests are interfering, typically by sharing data on the server (e.g. two tests editing the same employee at the same time).
**Fix:** make each test create and use its own data. To confirm, run with `--workers=1`.

### Test passes locally but fails on CI
CI runs on slower Linux machines, with 1 worker, headless. Look at the trace from the CI artifact. Typical causes: timing (missing `await`, fixed waits), a smaller screen, or the site not being reachable from GitHub.

### Test is "flaky" (fails, then passes on retry)
See [Reports → Flaky tests](07-reports.md#flaky-tests).

## API tests

### `Timed out waiting 30000ms from config.webServer` / `Process from config.webServer was not able to start`
Playwright couldn't start the demo API. Usually **port 3001 is used by another program**.
**Fix:** find it with `netstat -ano | findstr :3001` and stop that program, or use another port for both the server and the tests: `$env:API_PORT=3002; npm test`.

### `Login to http://localhost:3001 failed with 401`
The API login was rejected. If you set `API_USERNAME` / `API_PASSWORD` (or `API_BASE_URL` to another server), check them. The demo server's login is `admin` / `admin123`.

### `connect ECONNREFUSED 127.0.0.1:3001`
Nothing is listening at the API address. If `API_BASE_URL` is set, Playwright doesn't start the demo server: check that server is up, or remove the variable (`Remove-Item Env:API_BASE_URL`).

### `Unknown step "...". Available steps: ...`
A flow uses a step name that doesn't exist. Copy the exact name from the list in the error (names are case-sensitive). If it's a new step, register its file in `tests/api/support/steps.js`.

### `Unknown variable {{...}}. Known variables: ...`
A flow uses `{{name}}` before any step saved it. Add `"save": { "name": "<field>" }` to an earlier step, and check the spelling.

### Test `flow file <name>.flow.json is valid` failed
The flow file isn't valid JSON. The error says where; open the file in VS Code to see it underlined.

### `Two steps are named "...". Step names must be unique across all method folders.`
Two steps files define the same step name. Rename one.

### API test fails only when run with others
Tests run in parallel against the same server. Make sure the test creates its own data (`newUser()`, `{{unique}}`) and never changes the three start-up users (ids 1–3).

## Reports

### `npx playwright show-report` says no report found
For suite runs the report isn't in the default folder.
**Fix:** `npx playwright show-report reports/<suite>/html`.

### The trace won't open when I double-click `index.html`
Traces need the report to be served.
**Fix:** open it with `npx playwright show-report <folder>`.

### There's no screenshot of the failure
Screenshots are not turned on in `playwright.config.js`. Use `error-context.md` or the trace, or turn screenshots on (see [Reports](07-reports.md#getting-more-evidence-for-a-failure)).

### There's no trace
Traces are recorded only on the first **retry**. Run with `--retries=1` or `--trace on`.

## Email

See the full message table in [Email reports](08-email-reports.md#what-youll-see-in-the-console). The most common ones:

### `Email: NOT sent. SMTP_USER and SMTP_PASS are not set. Fill them in in .env.local.`
`.env.local` is missing from the project root, or a line is empty. Check the file name is exactly `.env.local` (Windows sometimes hides the extension and saves it as `.env.local.txt`; turn on **View → File name extensions** in Explorer to check).

### `Invalid login: 535 5.7.139 Authentication unsuccessful`
Wrong password, multi-factor sign-in without an app password, or password login for SMTP is disabled by your organisation. See [Which password?](08-email-reports.md#which-password-microsoft-365)

### `SendAsDenied` / `554 5.2.252`
The `from` address in `project.json` isn't the same as `SMTP_USER`.
**Fix:** use the `SMTP_USER` address in `from`.

### `Greeting never received` / `ETIMEDOUT` / `ECONNREFUSED`
The machine can't reach the mail server: no internet, a firewall or VPN blocking port 587, or a wrong `host`/`port`.
**Fix:** check `smtp` settings; try from another network; ask IT whether outgoing port 587 is allowed.

### I got a "delivery has failed" email after a run
One of the addresses in `to`/`cc`/`bcc` doesn't exist (for example a leftover `@example.com` placeholder).
**Fix:** remove it from `project.json`.

### The email arrived but has no charts
The console said `Email: charts could not be drawn`: no browser could be started to draw them (install Chrome or Edge). If the console didn't say that, check `"charts": true` in `project.json`.

### I fixed the email problem; how do I send the report without re-running?
`npm run send-report -- <suite>` sends the latest results of that suite.

## Still stuck?

1. Re-run the single failing test headed and watch it: `npx playwright test -g "<title>" --headed --workers=1`.
2. Open the trace.
3. Search the error text in the [Playwright docs](https://playwright.dev/docs/intro) or [GitHub issues](https://github.com/microsoft/playwright/issues).
4. Ask the team, sharing the error message, the test title, the browser, and the trace or report.
