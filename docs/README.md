# POM V2 Automation Framework: Documentation

Welcome! This folder explains how the test automation framework works and how to use it day to day. It's written for people who are new to this project, and it assumes no prior knowledge of Playwright.

The framework tests the **OrangeHRM** web application. It's built on [Playwright](https://playwright.dev) (JavaScript) and adds a few things you may know from a Selenium + TestNG setup:

- **Choose the browser per test** (Chrome, Edge or both) from one JSON file, with no annotations in the test code.
- **Test suites** like `testng.xml`, run with `suite.bat` like `testng.bat`.
- **Reports**: a colourful dashboard with charts and a timeline, plus HTML, JUnit XML and JSON for every suite run.
- **Email reports** with colour charts, sent automatically to the project's mailing list.
- **API testing**: a demo REST API with Swagger docs, tests organised by HTTP method, and **flows** that link requests across methods.
- **Microsoft Teams reporting**: every suite run posts a result card to the project's Teams channel.

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
| 11 | [API testing](11-api-testing.md) | What API testing is, the folder per method, writing API tests, running the API suite |
| 12 | [API server and Swagger](12-api-server-and-swagger.md) | The demo API, what Swagger/OpenAPI is, using the Swagger page |
| 13 | [API flows](13-api-flows.md) | Linking requests from different methods into one scenario (POST → GET → DELETE) |
| 14 | [Teams reporting](14-teams-reporting.md) | Posting run results to a Microsoft Teams channel: setup, Run IDs, history, adding projects |

## Quick reference

```powershell
npm ci                                   # install dependencies (first time, or after package.json changes)
npm run test:list                        # show which tests run in which browser, without running them
npm test                                 # run every test
.\suite.bat smoke                        # run the smoke suite, save reports, send the email
.\suite.bat regression --no-email        # run the regression suite without sending email
.\suite.bat smoke --headed               # watch the browser while the suite runs
.\suite.bat api                          # run all API tests, save reports, send the email
.\suite.bat --all                        # run EVERY suite one after another, send ONE combined email
.\suite.bat smoke api                    # run chosen suites one after another, one combined email
npm run test:api                         # run all API tests (no suite)
npm run api:start                        # start the demo API; Swagger UI at http://localhost:3001/docs
npm run test:teams                       # send a sample result card to the Teams channel
.\suite.bat smoke --no-teams             # run without posting to Teams
start reports/smoke/dashboard.html               # open the dashboard of the last smoke run
npx playwright show-report reports/smoke/html   # open the Playwright HTML report (traces)
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
| `tests/api/<method>/*.spec.js` | Writing API tests |
| `tests/api/<method>/*.steps.js` | Adding reusable API requests (steps) |
| `tests/api/flows/*.flow.json` | Linking API steps into a flow |
| `utilities/globalApi.js` | Adding an API endpoint |
| `.env.local` | Your SMTP login and Teams webhook URL (on your machine only, never committed) |
