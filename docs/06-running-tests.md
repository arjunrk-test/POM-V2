# 6. Running tests

There are two ways to run tests:

| | **Plain Playwright run** (`npm test`, `npx playwright test`) | **Suite run** (`.\suite.bat <suite>`) |
|---|---|---|
| Which tests | All tests (or what you filter on the command line) | The tests listed in the suite file |
| Browsers | From `browsers.json` | From `browsers.json` |
| Checks the suite first | – | Yes |
| Reports | `playwright-report/` (HTML) and `reports/local/dashboard.html` | `reports/<suite>/` (dashboard, HTML, JUnit XML, JSON) |
| Email | No | Yes (unless `--no-email`) |
| Use it for | Writing and debugging tests | Official runs: smoke, regression, nightly |

All commands below are run from the project folder in a terminal (VS Code: **Terminal → New Terminal**).

## npm scripts (shortcuts in `package.json`)

| Command | What it runs | Use it to |
|---|---|---|
| `npm test` | `playwright test` | Run every test in its browser(s) |
| `npm run test:list` | `playwright test --list` | See which tests run in which browser, without running them |
| `npm run test:chrome` | `playwright test --project=chrome` | Run only the Chrome tests |
| `npm run test:edge` | `playwright test --project=edge` | Run only the Edge tests |
| `npm run test:headed` | `playwright test --headed` | Run with the browser windows visible |
| `npm run test:ui` | `playwright test --ui` | Open Playwright's UI mode (see below) |
| `npm run test:debug` | `playwright test --debug` | Run step by step in the Playwright Inspector |
| `npm run report` | `playwright show-report` | Open the last plain-run HTML report |
| `npm run codegen` | `playwright codegen` | Record a test by clicking in a browser |
| `npm run suite -- <name>` | `node scripts/run-suite.js <name>` | Run a suite (same as `suite.bat`) |
| `npm run send-report -- <name>` | `node scripts/send-report.js <name>` | Re-send the last email of a suite |

To pass extra options through an npm script, put them after `--`:

```powershell
npm test -- --headed
npm run test:chrome -- -g "log in"
```

## Picking which tests to run

### One file
```powershell
npx playwright test tests/example.spec.js
```

### One test, by line number
```powershell
npx playwright test tests/example.spec.js:6
```
`6` is the line where `test(...)` starts.

### By title (`-g` / `--grep`)
```powershell
npx playwright test -g "log in"                 # titles containing "log in"
npx playwright test -g "log in|logout"          # titles containing either (it's a regular expression)
npx playwright test --grep-invert "slow"        # everything except titles containing "slow"
```

### By tag
If tests are tagged, e.g. `test('...', { tag: '@smoke' }, async ({ page }) => {...})`:
```powershell
npx playwright test -g "@smoke"
```

### By browser
```powershell
npx playwright test --project=chrome
npx playwright test --project=edge
```
This only narrows: a test that `browsers.json` assigns to Edge only won't run with `--project=chrome`.

### Only the tests that failed last time
```powershell
npx playwright test --last-failed
```

Filters can be combined, e.g. `npx playwright test tests/example.spec.js --project=edge -g "log in"`.

## Watching and debugging

### Headed mode: see the browser
Tests run **headless** (no visible window) by default; it's faster. To watch:
```powershell
npx playwright test -g "log in" --headed
```
Tip: add `--workers=1` so only one browser window opens at a time.

### UI mode: the best way to work on tests
```powershell
npm run test:ui
```
Opens a window where you can:
- see all tests in a tree, filter them and run any of them with one click,
- watch each step with a screenshot of the page before and after it ("time travel"),
- pick a locator by pointing at the page,
- re-run tests automatically when you save a file (the 👁 "watch" icon).

### Debug mode: step through a test
```powershell
npx playwright test -g "log in" --debug
```
Opens the browser and the **Playwright Inspector**. The test pauses before the first action; use **Step over** to run one action at a time and see what the page looks like. You can also pause at a specific point by adding this line in the test temporarily:
```js
await page.pause();
```
(Remove it before pushing.)

### From VS Code
With the **Playwright Test for VSCode** extension, click the green ▶ next to a test to run it, or right-click ▶ → **Debug Test** to stop at breakpoints.

## Useful options

| Option | Effect |
|---|---|
| `--headed` | Show the browser |
| `--workers=1` | Run one test at a time (easier to watch; avoids overloading a slow site) |
| `--retries=2` | Retry failed tests up to 2 times |
| `--repeat-each=5` | Run each test 5 times; good for checking if a test is flaky |
| `--trace on` | Record a trace of every test (normally only recorded on retries) |
| `--timeout=60000` | Allow each test up to 60 s instead of the default 30 s |
| `--reporter=list` | Print one line per test in the console |
| `-x` | Stop after the first failure |

Full list: <https://playwright.dev/docs/test-cli>.

## Settings that change on CI

When the environment variable `CI` is set (GitHub Actions sets it automatically), `playwright.config.js` changes some defaults:

| Setting | Locally | On CI |
|---|---|---|
| Retries | 0 | 2 |
| Workers | Automatic (based on CPU cores) | 1 |
| `test.only` left in the code | Allowed | The run fails |

A suite's `workers` and `retries` override both.

## Running suites

See [Test suites](05-test-suites.md#running-a-suite) for all the `suite.bat` options.

```powershell
.\suite.bat smoke
.\suite.bat regression --no-email
.\suite.bat smoke --headed --workers=1
```

## How long things take, and parallel runs

- Each test gets a **fresh browser context** (like a new incognito window), so tests never share cookies or logins and can safely run in parallel.
- `fullyParallel: true` in the config means tests run in parallel even inside one file.
- The number of parallel tests ("workers") defaults to about half your CPU cores. If the application under test is slow or rate-limited, use fewer workers (`--workers=2`, or `"workers"` in the suite file).
- The default timeout is **30 seconds per test** and **5 seconds per assertion**.
