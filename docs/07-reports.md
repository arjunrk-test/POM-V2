# 7. Reports

Every run produces reports. This guide explains where they are, what each one is for, and how to use them to find out why a test failed.

## Where reports are saved

| Run type | Dashboard | Playwright HTML report | Other files |
|---|---|---|---|
| Suite run (`.\suite.bat smoke`) | `reports/smoke/dashboard.html` | `reports/smoke/html/` | `reports/smoke/` |
| Plain run (`npm test`, `npx playwright test`) | `reports/local/dashboard.html` | `playwright-report/` | – |
| Any run: files from failed tests | | | `test-results/` |

These folders are git-ignored (never committed) and are **overwritten** by the next run of the same kind. A run of the `smoke` suite replaces `reports/smoke/` but leaves `reports/regression/` alone. If you need to keep a report, copy the folder somewhere else.

## The dashboard: start here

`dashboard.html` is the project's own report: one colourful page with the whole run at a glance. **Open it by double-clicking it.** It's a single self-contained file that needs no server and no internet, so it can also be emailed (it's attached to the report email) or copied to a shared drive.

It contains, from top to bottom:

| Section | What it shows |
|---|---|
| **Result strip** | A thin coloured bar along the top: the share of passed (green), failed (red), flaky (amber) and skipped (grey) tests. |
| **Header** | Project, suite, a PASSED / FAILED badge, start time, duration, environment, application URL, git branch and commit. |
| **Summary tiles** | Total, passed, failed, flaky, skipped, pass rate, duration, average time per test. Click a result tile to filter the test list. |
| **Overall result** | Donut chart of all results, with counts and percentages. |
| **Results by browser** | One bar per browser, split by result. |
| **Results by spec file** | One bar per test file, split by result, files with failures first. Shows which area of the app is unstable. |
| **Results by tag** | One bar per tag (`@smoke`, `@login`…), shown only if tests have tags. |
| **Slowest tests** | The 10 longest test runs (including retries). |
| **Execution timeline** | Each row is a parallel worker; each block is one test attempt, coloured by its result. Shows how well tests are spread across workers, and where retries happened. |
| **Failures** | One card per failed test: browser, file and line, number of attempts, the error message and the code where it failed. |
| **All tests** | Every test run in a table: filter by result, browser, file or tag, search, and sort by any column. **Click a row** to open its details (see below). |
| **Run environment** | Workers, retries, timeout, browsers, Playwright, Node.js and OS versions, machine name, git branch and commit. |

**Interacting with it:**
- **Hover** over any bar, donut segment or timeline block for its exact numbers.
- **Click** a bar or segment to filter the test list to those tests (e.g. click the red part of the *chrome* bar to list Chrome failures).
- The **🌙 / ☀ button** switches between light and dark themes (it follows your system setting until you choose).
- **Playwright report** (top right) opens the built-in report.

**Test details** (click a row in *All tests*):
- **Attempt tabs**, when a test was retried: *First run*, *Retry #1*… each with its own result and duration.
- **Details:** full title, file and line, browser, result, worker, start time, tags.
- **Steps:** every hook, `test.step`, Playwright action and assertion, with its duration; the failing step is marked ✕ in red.
- **Error:** the full message and the code snippet with the failing line marked `>`.
- **Screenshots:** shown inline when a test attaches them (click one to view it full size).
- **Page snapshot at failure:** the `error-context` text snapshot of the page.
- **Console output:** anything the test printed (`console.log`) and error output.
- **Open in Playwright report:** jumps to the same test in the built-in report, where the **trace** is.

> The dashboard can't open traces itself; use the *Open in Playwright report* link for those. The link works when the dashboard is opened from its folder in `reports/`, not from an email attachment.

## Suite reports: `reports/<suite>/`

```
reports/smoke/
├── dashboard.html   The dashboard (double-click to open)
├── html/            Playwright HTML report (open index.html via show-report)
├── results.xml      JUnit XML
├── results.json     JSON results
├── charts/          Chart images used in the email
│   ├── chart-overall.png
│   ├── chart-browsers.png
│   └── chart-durations.png
└── email.html       Copy of the email body
```

### Playwright HTML report: for traces and the finest detail

Open it with:

```powershell
npx playwright show-report reports/smoke/html
```

(For plain runs: `npm run report`. After a plain run with failures, it opens automatically.)

> Open it with `show-report` rather than double-clicking `index.html`: traces only open when the report is served this way.

What you'll see:
- **Top bar:** counts of passed / failed / flaky / skipped tests; click one to filter. There's also a search box (search by title, file, or `@tag`) and browser filters.
- **Test list:** grouped by file. Each row shows the title, the browser (`chrome` / `edge`) and the duration.
- **Click a test** to see:
  - **Errors:** the failure message, with the expected vs. received values and the exact line of code that failed.
  - **Test steps:** every action (`goto`, `fill`, `click`, `expect`…) with its timing. Expand a step to see where it is in the code.
  - **Attachments:** traces, screenshots and videos, if they were recorded (see below).
  - **Retries:** if the test was retried, each attempt has its own tab ("Run", "Retry #1", …).

### JUnit XML: `results.xml`
The standard test-result format (the equivalent of TestNG's `testng-results.xml`). You don't normally read it yourself; tools do. Jenkins (JUnit plugin), Azure DevOps, GitLab and most test-management tools import it to show test trends and history. It's also attached to the email.

### JSON: `results.json`
The complete results in JSON. The email (summary, tables, charts) is built from this file. Useful if you want to feed results into your own scripts or dashboards.

### `email.html` and `charts/`
A copy of the email body and its chart images, so you can see exactly what was (or would be) sent. Open `email.html` in a browser.

## `test-results/`: files from failed tests

For each failed test, Playwright creates a folder here named after the test and browser, e.g.:

```
test-results/example-user-can-log-in-with-valid-credentials-chrome/
├── error-context.md     What the page looked like when the test failed
└── trace.zip            (only if a trace was recorded)
```

- **`error-context.md`** contains a text snapshot of the page structure at the moment of failure: which headings, buttons, fields and texts were on the page. It's often enough to understand what went wrong (e.g. "the page still shows the login form, with an *Invalid credentials* message").
- The folder is emptied at the start of every run.

## What is recorded when a test fails

The current settings in `playwright.config.js`:

| Artifact | When it's recorded | Setting |
|---|---|---|
| **Error message + code line** | Always, for every failure | built in |
| **`error-context.md`** (page snapshot as text) | Always, for every failure | built in |
| **Trace** (full recording, see below) | Only on the **first retry** of a failed test | `trace: 'on-first-retry'` |
| **Screenshot** | Not recorded | not set (Playwright's default is off) |
| **Video** | Not recorded | not set (default off) |

So a trace exists only if the test failed **and** was retried, i.e. when retries are on: the `regression` suite (`"retries": 1`), CI runs (2 retries), or when you add `--retries=1`.

### Getting more evidence for a failure

Record a trace for one run:
```powershell
npx playwright test -g "log in" --trace on
```

To capture a screenshot of every failure permanently, add `screenshot` (and optionally `video`) to the `use` section of `playwright.config.js`:
```js
use: {
  trace: 'on-first-retry',
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
},
```
Screenshots and videos then appear under **Attachments** in the HTML report. Videos make runs slower and the reports larger; only turn them on if you need them.

## Traces: the most powerful debugging tool

A trace is a complete recording of a test: every action, a snapshot of the page before and after each one, console logs, network requests and errors.

Open it:
- From the HTML report: open the test → **Traces** → click the trace, or
- Directly: `npx playwright show-trace test-results/<test-folder>/trace.zip`

In the trace viewer:
- **Timeline** at the top: drag across it to see the page at any moment.
- **Actions** on the left: click one to see the page **before** and **after** it, and where on the page Playwright clicked (a red dot).
- **Tabs** at the bottom: *Console* (browser console messages), *Network* (every request and response), *Source* (the test code, with the current line highlighted), *Errors*.

The page snapshots are real HTML, so you can inspect elements in them with the locator picker.

## Reading a failure: a worked example

A real failure from this project:

```
Error: expect(page).toHaveURL(expected) failed

Expected: "https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index"
Received: ""
Timeout: 5000ms

  21 |   await expect(page).toHaveURL(URLS.dashboard);
     |                      ^
```

How to read it:
1. **Which check failed:** `toHaveURL` on line 21: the page never reached the dashboard.
2. **Expected vs. Received:** the expected dashboard URL vs. `""`, an *empty* URL. The page hadn't loaded at all, so this isn't a wrong-password problem.
3. **Timeout: 5000ms:** Playwright retried the check for 5 seconds before giving up.
4. **Next step:** open `error-context.md` or the trace to see what was on screen. An empty URL plus a blank page usually means the site was slow or unreachable (the OrangeHRM demo site is a public server and is sometimes slow), not a bug in the test. Re-run it; if it keeps failing, open the site manually.

General approach:
1. Read the **error message** and the **code line**.
2. Look at the **page state**: `error-context.md`, screenshot, or trace.
3. Decide: **real bug** (the application is wrong), **test bug** (the locator or expected value is wrong), or **environment** (site down, slow network).
4. Re-run just that test headed to watch it: `npx playwright test -g "<title>" --headed --workers=1`.

## Flaky tests

A test is **flaky** when it fails and then passes on a retry. The report and the email list flaky tests separately. A flaky test still counts as passing for the run's result, but it's a warning sign: something is timing-dependent. Check it with:

```powershell
npx playwright test -g "<title>" --repeat-each=10 --workers=1
```

Common causes: a missing `await`, asserting before the page has updated (use web-first assertions like `toBeVisible`, which wait, instead of reading values directly), or tests depending on each other's data.
