# 4. Browser selection (`browsers.json`)

Each UI test can run in **Chrome only**, **Edge only**, or **both**. You choose this in one file, `test-plans/browsers.json`, not in the test code. Playwright reads the file every time it starts.

## The file

```json
{
  "defaultBrowsers": ["chrome"],
  "tests": {
    "user can log in with valid credentials": ["chrome", "edge"]
  }
}
```

| Field | Meaning |
|---|---|
| `defaultBrowsers` | Browsers for every test that is **not** listed under `tests`. |
| `tests` | Test title → list of browsers for that test. |

Browser names:

| Name | Browser |
|---|---|
| `chrome` | Google Chrome installed on the machine |
| `edge` | Microsoft Edge installed on the machine |

> **API tests** (`tests/api/`) don't use a browser, so this file doesn't apply to them: they always run once, in the `api` project. See [API testing](11-api-testing.md).

## Common choices

```json
{
  "defaultBrowsers": ["chrome"],
  "tests": {
    "user can log in with valid credentials":   ["chrome", "edge"],
    "admin can export the employee report":      ["edge"],
    "user can upload a profile picture":         ["chrome"]
  }
}
```

| You want the test to run in… | Write |
|---|---|
| Chrome only | `["chrome"]` (or don't list it, since the default is Chrome) |
| Edge only | `["edge"]` |
| Both | `["chrome", "edge"]` |

### Choosing `defaultBrowsers`

| Setting | Effect on tests you don't list |
|---|---|
| `["chrome"]` (current) | They run in Chrome. You only list the exceptions. |
| `["chrome", "edge"]` | They run in both. List only tests that should be limited to one browser. |
| `[]` | They **don't run at all**. Only listed tests run. Use with care: a new test you forget to add will silently never run. |

The current setting (`["chrome"]`) is the safest: a new test always runs somewhere, even if nobody updates this file.

## How test titles are matched

The key in `tests` is the **test title**, exactly as written in `test('...')`, including capital letters, spaces and punctuation.

```js
test('user can log in with valid credentials', ...)
//    └──────────── this exact text ──────────┘
```

- Tests inside `test.describe('Login', ...)` can be written as just the title, or as `"Login <title>"` to tell apart two tests with the same title in different groups.
- Tags (like `{ tag: '@smoke' }`) are ignored for matching.
- The match is on the **end** of the full title, so a very short key like `"login"` would also match `"user can login"`. Keep titles unique and descriptive (see [title rules](03-writing-tests.md#test-title-rules)).

## Checking your changes

Always check with:

```powershell
npm run test:list
```

It lists every test with the browser it'll run in, without running anything:

```
Listing tests:
  [chrome] › example.spec.js:6:5 › user can log in with valid credentials
  [edge] › example.spec.js:6:5 › user can log in with valid credentials
Total: 2 tests in 1 file
```

`[chrome]` / `[edge]` at the start of each line is the browser. A test that should run in both appears twice.

## Mistakes the framework catches for you

The file is checked every time Playwright starts. These stop the run with a clear error:

| Mistake | Error |
|---|---|
| Misspelled browser: `["chorme"]` | `unknown browser "chorme" in test "…". Use one of: chrome, edge` |
| Empty list: `"my test": []` | `test "my test" must be a non-empty array of browsers (chrome, edge)` |
| A single string instead of a list: `"my test": "chrome"` | same as above: it must be a list, `["chrome"]` |
| Broken JSON (missing comma, trailing comma, comments) | `Could not read …browsers.json: <JSON error>` |

### The one mistake it can't catch
If a title in `tests` doesn't match any test (typo, or the test was renamed), there is no error: that entry simply does nothing, and the real test runs in `defaultBrowsers`. After renaming tests, run `npm run test:list` and check. (Suites *do* catch this; see [Test suites](05-test-suites.md#checks-before-the-run).)

## JSON tips

JSON is strict:
- Use double quotes `"`, never single quotes `'`.
- No comma after the last item in a list or object.
- No comments (`//` is not allowed).

VS Code underlines JSON errors in red. Save the file and look for red marks before running.

## How it works (for the curious)

Playwright has a concept called **projects**: the same tests run once per project, each with its own settings. `utilities/browserPlan.js` creates one project per browser (`chrome`, `edge`) and gives each project a filter (Playwright's `grep` / `grepInvert`) built from `browsers.json`, so each project only contains the tests meant for that browser. That's why unassigned tests don't even appear as "skipped": they're simply not part of that browser's project.

## Adding another browser

To add, say, Firefox:

1. In `utilities/browserPlan.js`, add it to `BROWSERS`:
   ```js
   export const BROWSERS = {
     chrome: { ...devices['Desktop Chrome'], channel: 'chrome' },
     edge: { ...devices['Desktop Edge'], channel: 'msedge' },
     firefox: { ...devices['Desktop Firefox'] },
   };
   ```
2. Install it: `npx playwright install firefox`.
3. On CI, add it to the install step in `.github/workflows/playwright.yml`: `npx playwright install --with-deps chrome msedge firefox`.
4. Use `"firefox"` in `browsers.json`.
