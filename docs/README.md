# POM V2 Automation Framework: Documentation

Welcome! This folder explains how the test automation framework works and how to use it day to day. It's written for people who are new to this project, and it assumes no prior knowledge of Playwright.

The framework tests the **OrangeHRM** web application. It's built on [Playwright](https://playwright.dev) (JavaScript) and adds a few things you may know from a Selenium + TestNG setup:

- **Choose the browser per test** (Chrome, Edge or both) from one JSON file, with no annotations in the test code.
- **Test suites** like `testng.xml`, run with `suite.bat` like `testng.bat`.
- **Reports**: HTML, JUnit XML and JSON for every suite run.
- **Email reports** with colour charts, sent automatically to the project's mailing list.

## Where to start

If you are new, read these in order:

| # | Document | What you'll learn |
|---|---|---|
| 1 | [Overview](01-overview.md) | What the framework does, how the parts fit together, what every folder and file is for |
| 2 | [Setup](02-setup.md) | Installing everything on your machine and doing your first run |
| 3 | [Writing tests](03-writing-tests.md) | How to write a new test, where URLs and locators go, naming rules |
| 4 | [Browser selection](04-browser-selection.md) | Choosing which browser(s) each test runs in (`browsers.json`) |
| 5 | [Test suites](05-test-suites.md) | Grouping tests into suites like smoke and regression (the `testng.xml` equivalent) |
| 6 | [Running tests](06-running-tests.md) | Every way to run tests: all, one suite, one test, one browser, headed, debug |
| 7 | [Reports](07-reports.md) | Where reports are saved and how to read them to debug a failure |
| 8 | [Email reports](08-email-reports.md) | `project.json`, mailing lists, SMTP login, charts |
| 9 | [CI with GitHub Actions](09-ci-github-actions.md) | How tests run automatically on GitHub |
| 10 | [Troubleshooting](10-troubleshooting.md) | Common errors and how to fix them |

## Quick reference

```powershell
npm ci                                   # install dependencies (first time, or after package.json changes)
npm run test:list                        # show which tests run in which browser, without running them
npm test                                 # run every test
.\suite.bat smoke                        # run the smoke suite, save reports, send the email
.\suite.bat regression --no-email        # run the regression suite without sending email
.\suite.bat smoke --headed               # watch the browser while the suite runs
npx playwright show-report reports/smoke/html   # open the HTML report of the last smoke run
```

## The files you will edit most

| File | Why you edit it |
|---|---|
| `tests/*.spec.js` | Writing and changing tests |
| `utilities/globalUrl.js` | Adding a page URL |
| `utilities/globalElements.js` | Adding a locator (element) |
| `test-plans/browsers.json` | Choosing the browser(s) for a test |
| `test-plans/suites/*.json` | Adding a test to a suite, or creating a new suite |
| `project.json` | Changing who receives the report email |
| `.env.local` | Your SMTP login (on your machine only, never committed) |
