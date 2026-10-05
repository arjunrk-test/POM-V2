# 5. Test suites

A **suite** is a named group of tests you run together, for example a quick **smoke** suite after every deployment and a full **regression** suite every night. Suites are this framework's version of TestNG's `testng.xml`, and `suite.bat` is the version of `testng.bat`.

## Where suites live

One JSON file per suite in `test-plans/suites/`. The file name (without `.json`) is the suite's name on the command line:

```
test-plans/suites/
├── smoke.json        → .\suite.bat smoke
├── regression.json   → .\suite.bat regression
└── api.json          → .\suite.bat api   (every API test)
```

## The suite file

```json
{
  "name": "Smoke",
  "workers": 2,
  "retries": 0,
  "files": [],
  "tests": [
    "user can log in with valid credentials"
  ]
}
```

| Field | Required | Meaning | TestNG equivalent |
|---|---|---|---|
| `name` | No | Display name, used in the JUnit report. Defaults to the file name. | `<suite name="...">` |
| `workers` | No | How many tests run at the same time. Leave it out for automatic. Use `1` to run one at a time. | `thread-count` |
| `retries` | No | How many times a failed test is retried before it counts as failed. | `retryAnalyzer` |
| `files` | One of `files` / `tests` | Spec files **or folders** whose every test belongs to the suite. Paths are relative to the `tests/` folder, e.g. `"login.spec.js"`, `"api"`, `"api/flows"`. | `<class name="...">` / `<package name="...">` |
| `tests` | One of `files` / `tests` | Individual tests, by **test title**. | `<include name="...">` |

You can use `files`, `tests`, or both. A test in both lists simply runs once.

### Examples

**Run whole files:**
```json
{
  "name": "Regression",
  "retries": 1,
  "files": ["example.spec.js", "login.spec.js", "employees/create.spec.js"],
  "tests": []
}
```
For files in subfolders, include the folder: `"employees/create.spec.js"` means `tests/employees/create.spec.js`.

**Pick individual tests:**
```json
{
  "name": "Smoke",
  "workers": 2,
  "files": [],
  "tests": [
    "user can log in with valid credentials",
    "admin can open the employee list"
  ]
}
```

**A whole folder** (here, every API test):
```json
{
  "name": "API",
  "workers": 4,
  "files": ["api"],
  "tests": []
}
```

**Mix both:**
```json
{
  "name": "Login and PIM",
  "files": ["login.spec.js"],
  "tests": ["admin can open the employee list"]
}
```

## Which browser does a suite test run in?

**Suites decide *which* tests run. `browsers.json` decides *where* they run.** A suite never sets browsers itself. (API tests always run once, in the `api` project, without a browser.)

So if `browsers.json` says:
```json
{
  "defaultBrowsers": ["chrome"],
  "tests": { "user can log in with valid credentials": ["chrome", "edge"] }
}
```
then in every suite, the login test runs in both Chrome and Edge, and every other test in the suite runs in Chrome. You set a test's browsers once and every suite follows them.

## Creating a new suite

1. Create a new file in `test-plans/suites/`, e.g. `sanity.json`:
   ```json
   {
     "name": "Sanity",
     "workers": 2,
     "retries": 0,
     "files": [],
     "tests": ["user can log in with valid credentials"]
   }
   ```
2. Check it without running it (the browsers won't open):
   ```powershell
   $env:SUITE="sanity"; npx playwright test --list; Remove-Item Env:SUITE
   ```
3. Run it:
   ```powershell
   .\suite.bat sanity --no-email
   ```

## Running a suite

```powershell
.\suite.bat smoke
```

Other forms:

| Command | What it does |
|---|---|
| `.\suite.bat smoke` | Run the suite, save reports, send the email |
| `.\suite.bat smoke --no-email` | Same, but don't send the email |
| `.\suite.bat smoke --no-teams` | Run the suite without posting to Microsoft Teams ([Teams reporting](14-teams-reporting.md)) |
| `.\suite.bat smoke --teams-dry-run` | Build the Teams card in `reports/teams/` without posting it |
| `.\suite.bat smoke --email-dry-run` | Build the email (preview at `reports/smoke/email.html`) but don't send it |
| `.\suite.bat smoke --headed` | Show the browsers while the tests run |
| `.\suite.bat smoke --project=edge` | Run only the suite's Edge tests |
| `.\suite.bat smoke -g "log in"` | Run only the suite's tests whose title contains "log in" |
| `.\suite.bat smoke regression api` | Run these suites one after another, one combined email |
| `.\suite.bat --all` | Run every suite one after another, one combined email |
| `.\suite.bat` | Show usage and the list of available suites |
| `npm run suite -- smoke` | Same as `.\suite.bat smoke`; works on macOS/Linux and CI too |

Any option that isn't `--no-email` or `--email-dry-run` is passed straight to Playwright, so all of Playwright's [command-line options](https://playwright.dev/docs/test-cli) work.

In **Command Prompt** (cmd) type `suite.bat smoke`; in **PowerShell** type `.\suite.bat smoke` (PowerShell needs the `.\` to run a file in the current folder).

## Running several suites with one command

Like a TestNG master `testng.xml` that lists other suite files, you can run several suites back to back:

```powershell
.\suite.bat --all                     # every suite in test-plans/suites/, in alphabetical order
.\suite.bat smoke regression api      # these suites, in this order
npm run suite:all                     # same as .\suite.bat --all
```

What happens:
1. **Every suite is checked first.** If any suite has a problem (unknown name, a test that doesn't exist…), nothing runs and the errors are listed.
2. **The suites run one after another**, each with its own `workers` and `retries`. A suite with failures **doesn't stop** the next one.
3. **Each suite writes its own reports** to `reports/<suite>/` as usual (dashboard, HTML report, JUnit XML).
   After the last suite, the dashboards are merged into **one consolidated dashboard**: `reports/all-suites/dashboard.html` (see [Reports](07-reports.md#consolidated-dashboard-for-several-suites)).
4. A **summary** is printed:
   ```
   === Summary ===
     PASSED  api
     FAILED  regression
     PASSED  smoke
   ```
5. **One combined email** is sent for the whole run (see [Email reports](08-email-reports.md#combined-email-for-several-suites)) instead of one email per suite.
6. The exit code is **0** only if every suite passed, otherwise **1**.

All the usual options work and apply to every suite: `--no-email`, `--email-dry-run`, `--headed`, `--project=edge`, `-g "..."`. Put the suite names **first** and the options after them.

To run a fixed set every night, schedule `suite.bat` with the arguments `--all` (or `smoke regression api`) in Windows Task Scheduler (see [below](#running-a-suite-on-a-schedule-windows)).

## What happens during a suite run

Example output:

```
Suite: Smoke, 2 test run(s)
  chrome: 1
  edge: 1

Running 2 tests using 2 workers
  ✓  1 [chrome] › tests\example.spec.js:6:5 › user can log in with valid credentials (7.5s)
  ✓  2 [edge] › tests\example.spec.js:6:5 › user can log in with valid credentials (5.1s)

  2 passed (9.0s)

Dashboard:    reports/smoke/dashboard.html  (double-click to open)
HTML report:  reports/smoke/html/index.html  (open with: npx playwright show-report reports/smoke/html)
JUnit report: reports/smoke/results.xml
Email: sent "[OrangeHRM QA] smoke suite PASSED: 2/2 passed" to ...
```

Step by step:

### Checks before the run
Before opening any browser, the runner checks the suite:

| Problem | What you see |
|---|---|
| Suite file doesn't exist | `Suite "smok" not found in …\test-plans\suites` and the list of available suites |
| Suite has no `files` and no `tests` | `a suite needs at least one entry in "files" or "tests"` |
| A file or folder in `files` doesn't exist | `file "logn.spec.js" not found in …\tests (paths are relative to the tests folder)` |
| A title in `tests` matches no test | `Suite "smoke" lists entries that match no test in any browser:` followed by the bad entries |

That last check is important: a typo or a renamed test makes the run **fail loudly** instead of the test silently being left out. It also fires if a listed test exists but `browsers.json` gives it no browser (only possible when `defaultBrowsers` is `[]`).

### The run
The runner prints how many tests will run in each browser, then runs Playwright with the suite's `workers` and `retries`.

### Reports
Every suite run writes to `reports/<suite>/`, replacing the previous run of the **same** suite:

| File | What it is |
|---|---|
| `reports/<suite>/dashboard.html` | The dashboard: charts, timeline, failures and every test's details on one page. Double-click to open. |
| `reports/<suite>/html/` | The Playwright HTML report: every test, step and error, plus traces |
| `reports/<suite>/results.xml` | JUnit XML, the equivalent of `testng-results.xml`; Jenkins and most CI tools read it |
| `reports/<suite>/results.json` | Full results as JSON; the email is built from it |
| `reports/<suite>/charts/` | The chart images used in the email |
| `reports/<suite>/email.html` | A copy of the email body you can open in a browser |

See [Reports](07-reports.md).

### Email
After the run, the results are emailed to the people in `project.json`. See [Email reports](08-email-reports.md). If the email fails (wrong password, no internet), the error is printed but the run's result isn't affected.

### Exit code
`suite.bat` exits with **0** if every test passed and **1** if any failed (or a check failed). Scripts, schedulers and CI tools use this to know whether the run succeeded.

## Running a suite on a schedule (Windows)

To run regression every night with Windows Task Scheduler:

1. Open **Task Scheduler** → **Create Basic Task**.
2. Name it, e.g. "Nightly regression", and choose **Daily** and a time.
3. Action: **Start a program**.
   - Program/script: the full path to `suite.bat`, e.g. `C:\Projects\POM V2\suite.bat`
   - Add arguments: `regression`
   - Start in: the project folder, e.g. `C:\Projects\POM V2`
4. Finish. The machine must be on (and the user logged in, unless you choose "Run whether user is logged on or not").

The email arrives when the run finishes.
