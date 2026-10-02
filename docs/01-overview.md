# 1. Overview

This document explains what the framework is, how a test run flows from start to finish, and what every folder and file is for. Read it once before anything else; the rest of the docs assume you know this picture.

## What the framework is

It is a **UI test automation framework** for the OrangeHRM web application, built on **Playwright Test** with **JavaScript**.

- **Playwright** controls real browsers (Google Chrome and Microsoft Edge here): it opens pages, clicks, types and checks results. It plays the role Selenium WebDriver played in older frameworks.
- **Playwright Test** is Playwright's built-in test runner. It finds test files, runs them (in parallel), retries failures and produces reports. It plays the role TestNG or JUnit played.

On top of plain Playwright, this project adds:

| Feature | What it gives you | Where it lives |
|---|---|---|
| Page-object style utilities | URLs and locators kept in one place, not repeated in every test | `utilities/globalUrl.js`, `utilities/globalElements.js` |
| Browser selection | Choose Chrome, Edge or both per test, from a JSON file | `test-plans/browsers.json` |
| Test suites | Named groups of tests (smoke, regression, …), like `testng.xml` | `test-plans/suites/*.json` |
| Suite runner | One command runs a suite, checks it, saves reports, sends email (like `testng.bat`) | `suite.bat`, `scripts/run-suite.js` |
| Email reports | HTML email with charts and the reports attached | `project.json`, `scripts/send-report.js`, `scripts/report-charts.js` |

### If you come from Selenium + TestNG

| Selenium / TestNG | This framework |
|---|---|
| `WebDriver`, `driver.findElement(...)` | Playwright `page`, `page.locator(...)` |
| `@Test` method | `test('title', async ({ page }) => { ... })` |
| Test class | A `.spec.js` file in `tests/` |
| `testng.xml` | A JSON file in `test-plans/suites/` |
| `testng.bat` | `suite.bat <suite-name>` |
| `thread-count` / `parallel` | `"workers"` in the suite file |
| `retryAnalyzer` | `"retries"` in the suite file |
| `test-output/` / `testng-results.xml` | `reports/<suite>/html` / `reports/<suite>/results.xml` |
| Browser annotations on each test | `test-plans/browsers.json` |
| Explicit waits (`WebDriverWait`) | Not needed in most cases: Playwright waits automatically for elements to be ready |

## How a suite run works, start to finish

When you type `.\suite.bat smoke`, this happens:

```
suite.bat smoke
   │
   ▼
scripts/run-suite.js
   │  1. Checks test-plans/suites/smoke.json exists
   │  2. Asks Playwright to LIST (not run) the tests in the suite
   │     and checks every test/file named in the suite really exists
   │  3. Prints how many tests will run in each browser
   │  4. Runs Playwright with SUITE=smoke
   │        │
   │        ▼
   │     playwright.config.js
   │        │  reads SUITE → loads test-plans/suites/smoke.json
   │        │  reads test-plans/browsers.json
   │        │  builds one "project" per browser (chrome, edge), each
   │        │  filtered to the tests that belong in that browser
   │        ▼
   │     Tests run in Chrome and/or Edge
   │        │
   │        ▼
   │     reports/smoke/html/        (HTML report)
   │     reports/smoke/results.xml  (JUnit XML)
   │     reports/smoke/results.json (JSON, used by the email)
   │
   │  5. scripts/send-report.js
   │        reads project.json (who to email) and .env.local (SMTP login)
   │        draws charts (scripts/report-charts.js) → reports/smoke/charts/
   │        sends the email with charts + attached reports
   ▼
Exit code: 0 if all tests passed, 1 if any failed
```

When you run plain `npm test` (no suite), only the middle part happens: every test runs in the browsers set in `browsers.json`, and the normal Playwright HTML report is written to `playwright-report/`. No email is sent.

## Folder and file map

```
POM V2/
├── .github/workflows/playwright.yml   GitHub Actions: runs the tests on GitHub on every push / pull request
├── docs/                              This documentation
├── scripts/
│   ├── run-suite.js                   The suite runner (what suite.bat calls)
│   ├── send-report.js                 Builds and sends the report email
│   └── report-charts.js               Draws the charts used in the email
├── test-plans/
│   ├── browsers.json                  Which browser(s) each test runs in
│   └── suites/
│       ├── smoke.json                 The smoke suite
│       └── regression.json            The regression suite
├── tests/
│   └── example.spec.js                The test files (*.spec.js)
├── utilities/
│   ├── globalUrl.js                   All page URLs used by tests
│   ├── globalElements.js              All locators (elements) used by tests
│   └── browserPlan.js                 Reads browsers.json + suites and builds the browser projects
├── .env.local                         Your SMTP login, on your machine only (git-ignored)
├── .gitignore                         Files git must never commit
├── package.json                       Dependencies and npm scripts (npm test, npm run suite, …)
├── package-lock.json                  Exact dependency versions (don't edit by hand)
├── playwright.config.js               Playwright settings: test folder, retries, workers, reporters, browsers
├── project.json                       Project details and the email settings (who receives reports)
└── suite.bat                          Run a suite on Windows: suite.bat <suite-name>
```

Folders created when you run tests (all git-ignored, safe to delete):

| Folder | Created by | Contents |
|---|---|---|
| `node_modules/` | `npm ci` | Installed packages |
| `reports/<suite>/` | Suite runs | HTML report, JUnit XML, JSON, charts, email preview |
| `playwright-report/` | Non-suite runs (`npm test`) | HTML report |
| `test-results/` | Every run | Screenshots, videos and traces of failed tests |

## What each file does, in more detail

### `playwright.config.js`
The main Playwright settings file. Playwright reads it every time it starts. It sets:
- **`testDir`**: tests live in `tests/`.
- **`fullyParallel: true`**: tests run in parallel, even tests inside the same file.
- **`retries`**: how many times a failed test is retried. It comes from the suite file if set, otherwise 2 on CI and 0 locally.
- **`workers`**: how many tests run at the same time. It comes from the suite file if set, otherwise 1 on CI and automatic (based on CPU cores) locally.
- **`reporter`**: for suite runs, console output plus HTML, JUnit and JSON reports in `reports/<suite>/`; otherwise just the HTML report.
- **`trace: 'on-first-retry'`**: when a test fails and is retried, Playwright records a trace (a step-by-step recording) of the retry. See [Reports](07-reports.md).
- **`projects`**: one per browser, built by `utilities/browserPlan.js` from `browsers.json` and the suite.

You rarely need to edit this file.

### `utilities/browserPlan.js`
The logic behind browser selection and suites. It:
- defines the available browsers (`chrome` = installed Google Chrome, `edge` = installed Microsoft Edge),
- reads and validates `test-plans/browsers.json` and the chosen suite file,
- builds one Playwright project per browser and gives each a filter so only the right tests run in it.

You only edit it to add a new browser (see [Browser selection](04-browser-selection.md#adding-another-browser)).

### `utilities/globalUrl.js` and `utilities/globalElements.js`
Central places for URLs and locators, so a change (a new URL, a changed button) is made once instead of in every test. See [Writing tests](03-writing-tests.md).

### `scripts/run-suite.js`, `scripts/send-report.js`, `scripts/report-charts.js`
The suite runner and the email. See [Test suites](05-test-suites.md) and [Email reports](08-email-reports.md).
