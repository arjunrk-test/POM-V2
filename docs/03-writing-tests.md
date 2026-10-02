# 3. Writing tests

This guide shows how a test is structured, where URLs and locators go, and the rules to follow so browser selection and suites keep working.

## The three building blocks

Every test uses three kinds of files:

| What | Where | Example |
|---|---|---|
| **Test file**: the steps and checks | `tests/<area>.spec.js` | `tests/example.spec.js` |
| **URLs**: every page address | `utilities/globalUrl.js` | `URLS.home`, `URLS.dashboard` |
| **Elements**: every locator | `utilities/globalElements.js` | `ELEMENTS.loginButton(page)` |

Tests never hard-code a URL or a selector. If the login button's selector changes, you fix it once in `globalElements.js` and every test that clicks it is fixed.

## Anatomy of a test

Here is the existing login test, `tests/example.spec.js`, explained line by line:

```js
// @ts-check
import { test, expect } from '@playwright/test';
import { URLS } from '../utilities/globalUrl';
import { ELEMENTS } from '../utilities/globalElements';

test('user can log in with valid credentials', async ({ page }) => {
  await page.goto(URLS.home);

  // Enter the username.
  await ELEMENTS.usernameInput(page).click();
  await ELEMENTS.usernameInput(page).fill('Admin');

  // Enter the password.
  await ELEMENTS.passwordInput(page).click();
  await ELEMENTS.passwordInput(page).fill('admin123');

  // Click the login button.
  await ELEMENTS.loginButton(page).click();

  // Login is successful if the browser lands on the dashboard URL.
  await expect(page).toHaveURL(URLS.dashboard);
});
```

| Line | What it means |
|---|---|
| `// @ts-check` | Turns on type checking in VS Code, so typos like `page.goTo` are underlined in red. Keep it at the top of every file. |
| `import { test, expect }` | `test` declares a test; `expect` makes assertions (checks). |
| `import { URLS } ...`, `import { ELEMENTS } ...` | Brings in the shared URLs and locators. |
| `test('user can log in with valid credentials', ...)` | Declares a test. The text is the **test title**, and it matters a lot (see [naming rules](#test-title-rules)). |
| `async ({ page }) => { ... }` | The test body. Playwright gives you a fresh `page` (a browser tab) for every test; tests never share state. |
| `await` | Every browser action is asynchronous, so **every action and assertion needs `await`**. Forgetting it is the most common beginner bug: the test moves on before the action finishes. |
| `page.goto(URLS.home)` | Opens a URL. |
| `.fill('Admin')` | Clears the field and types the text. (The `.click()` before it is optional; `fill` focuses the field itself.) |
| `expect(page).toHaveURL(...)` | The assertion. If the URL doesn't match (after retrying for up to 5 seconds), the test fails. |

### Playwright waits for you
Unlike Selenium, you almost never need explicit waits or `sleep`. Before clicking, Playwright automatically waits until the element exists, is visible, is enabled and has stopped moving. Assertions like `toHaveURL` and `toBeVisible` keep retrying until they pass or time out. **Don't add `page.waitForTimeout(...)`**: it makes tests slow and flaky.

## Adding a URL

Open `utilities/globalUrl.js` and add the address to `URLS`:

```js
export const BASE_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';
export const DASHBOARD_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/dashboard/index';

export const URLS = {
  home: `${BASE_URL}`,
  dashboard: `${DASHBOARD_URL}`,
  employeeList: 'https://opensource-demo.orangehrmlive.com/web/index.php/pim/viewEmployeeList', // new
};
```

Use it in a test as `URLS.employeeList`.

## Adding an element (locator)

Open `utilities/globalElements.js`. Each entry is a small function that takes the `page` and returns a locator:

```js
export const ELEMENTS = {
  // Login page
  /** @param {Page} page */
  usernameInput: (page) => page.locator("input[name='username']"),

  /** @param {Page} page */
  loginButton: (page) => page.locator('button.orangehrm-login-button'),

  // Dashboard (new)
  /** @param {Page} page */
  dashboardHeading: (page) => page.getByRole('heading', { name: 'Dashboard' }),
};
```

- Group entries by page with a comment (`// Login page`, `// Dashboard`).
- Keep the `/** @param {Page} page */` line above each entry: it gives VS Code auto-complete.
- Use it in a test: `await expect(ELEMENTS.dashboardHeading(page)).toBeVisible();`

### Choosing a good locator
Prefer locators that describe what the user sees; they survive UI changes better than CSS classes. In order of preference:

| Locator | Use for | Example |
|---|---|---|
| `page.getByRole(role, { name })` | Buttons, links, headings, checkboxes | `page.getByRole('button', { name: 'Login' })` |
| `page.getByLabel(text)` | Form fields with a label | `page.getByLabel('Username')` |
| `page.getByPlaceholder(text)` | Fields with placeholder text | `page.getByPlaceholder('Username')` |
| `page.getByText(text)` | Non-interactive text | `page.getByText('Invalid credentials')` |
| `page.getByTestId(id)` | Elements with a `data-testid` attribute | `page.getByTestId('save-btn')` |
| `page.locator(css)` | When nothing above works | `page.locator("input[name='username']")` |

Avoid long CSS/XPath chains like `div > div:nth-child(3) > span`: they break whenever the layout changes.

## Useful assertions

```js
await expect(page).toHaveURL(URLS.dashboard);                    // the page URL
await expect(page).toHaveTitle(/OrangeHRM/);                     // the page title
await expect(ELEMENTS.dashboardHeading(page)).toBeVisible();     // element is shown
await expect(ELEMENTS.loginButton(page)).toBeEnabled();          // element is enabled
await expect(ELEMENTS.errorMessage(page)).toHaveText('Invalid credentials'); // exact text
await expect(ELEMENTS.errorMessage(page)).toContainText('Invalid');          // part of the text
await expect(ELEMENTS.rows(page)).toHaveCount(5);                // number of matching elements
await expect(ELEMENTS.usernameInput(page)).toHaveValue('Admin'); // input value
```

Full list: <https://playwright.dev/docs/test-assertions>.

## Writing a new test, step by step

Say you want a test for a wrong password.

**1. Add any new locators** to `utilities/globalElements.js`:

```js
  /** @param {Page} page */
  loginError: (page) => page.getByText('Invalid credentials'),
```

**2. Write the test.** Either add it to an existing file that covers the same area, or create a new file like `tests/login.spec.js` (the name **must end in `.spec.js`**, or Playwright ignores it):

```js
// @ts-check
import { test, expect } from '@playwright/test';
import { URLS } from '../utilities/globalUrl';
import { ELEMENTS } from '../utilities/globalElements';

test('user sees an error with a wrong password', async ({ page }) => {
  await page.goto(URLS.home);
  await ELEMENTS.usernameInput(page).fill('Admin');
  await ELEMENTS.passwordInput(page).fill('wrong-password');
  await ELEMENTS.loginButton(page).click();

  await expect(ELEMENTS.loginError(page)).toBeVisible();
  await expect(page).toHaveURL(URLS.home);
});
```

**3. Decide the browsers.** If the test should run only in the default browser (Chrome), do nothing. Otherwise add it to `test-plans/browsers.json`, see [Browser selection](04-browser-selection.md):

```json
"user sees an error with a wrong password": ["chrome", "edge"]
```

**4. Add it to suites** if it belongs in smoke/regression, see [Test suites](05-test-suites.md). (A suite that lists the whole file in `"files"` picks it up automatically.)

**5. Check and run:**

```powershell
npm run test:list                                     # is it listed, in the right browsers?
npx playwright test -g "wrong password" --headed      # run just this test and watch it
```

## Test title rules

The **test title** (the first argument of `test(...)`) is how `browsers.json` and suite files find a test. Follow these rules:

1. **Make every title unique** across the whole project. Two tests with the same title can't be given different browsers.
2. **Make titles descriptive**: `user can log in with valid credentials`, not `test1` or `login`.
3. **Don't make one title the ending of another.** Matching works on the end of the title, so an entry for `"login"` would also match a test called `"user can login"`. Descriptive titles avoid this naturally.
4. **If you rename a test, update `browsers.json` and every suite file that mentions it.** Otherwise:
   - in `browsers.json`, the renamed test silently falls back to the default browser;
   - in a suite, `suite.bat` stops with *"lists entries that match no test"*, which is a reminder to fix it.

## Grouping tests with `describe`

Use `test.describe` to group related tests and share setup:

```js
test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.home);          // runs before every test in this group
  });

  test('user can log in with valid credentials', async ({ page }) => { /* ... */ });
  test('user sees an error with a wrong password', async ({ page }) => { /* ... */ });
});
```

In `browsers.json` and suites you can refer to these tests by their own title (`"user sees an error with a wrong password"`) or, if needed to tell two apart, prefixed with the group name: `"Login user sees an error with a wrong password"`.

## Recording a test instead of typing it

Playwright can write the code for you while you click through the app:

```powershell
npm run codegen -- https://opensource-demo.orangehrmlive.com
```

A browser and a code window open; every click and keystroke becomes a line of code. Copy the useful parts into your test, then **move the locators into `globalElements.js`** and the URLs into `globalUrl.js`. Recorded code is a starting point, not a finished test.

## Checklist before you push

- [ ] File name ends in `.spec.js` and lives in `tests/`
- [ ] Every action and assertion has `await`
- [ ] No hard-coded URLs or selectors in the test; they're in `globalUrl.js` / `globalElements.js`
- [ ] No `page.waitForTimeout(...)`
- [ ] The test title is unique and descriptive
- [ ] `browsers.json` and suite files updated if needed
- [ ] `npm run test:list` shows the test in the right browser(s)
- [ ] The test passes locally (`npx playwright test -g "<title>"`)
- [ ] No `test.only` left in the code (CI fails the build if it finds one)
