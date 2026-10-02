# 9. CI with GitHub Actions

The project is hosted on GitHub (`arjunrk-test/POM-V2`), and the tests run there automatically. This guide explains what the workflow file does, how to see the results, and how it differs from running locally.

## What "CI" means here

**Continuous Integration (CI)** means every change is tested automatically. GitHub has a built-in CI service, **GitHub Actions**: when something happens in the repository (a push, a pull request), GitHub starts a fresh virtual machine, follows the instructions in a **workflow file**, and reports the result.

The workflow file for this project is `.github/workflows/playwright.yml`. GitHub picks up any `.yml` file in `.github/workflows/` automatically; there's nothing to switch on.

## The workflow, line by line

```yaml
name: Playwright Tests
```
The name shown in the **Actions** tab.

```yaml
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
```
**When it runs:**
- every push of commits to the `main` or `master` branch;
- every pull request into `main` or `master` (when opened, and every time new commits are pushed to it).

Pushes to other branches don't trigger it until a pull request is opened.

```yaml
jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
```
One job called `test`, on a fresh **Linux (Ubuntu)** machine provided by GitHub. It's cancelled if it runs longer than 60 minutes. The machine is thrown away afterwards; nothing carries over between runs.

```yaml
    steps:
    - uses: actions/checkout@v4
```
Downloads the repository's code onto the machine.

```yaml
    - uses: actions/setup-node@v4
      with:
        node-version: lts/*
```
Installs the latest LTS version of Node.js.

```yaml
    - name: Install dependencies
      run: npm ci
```
Installs the packages listed in `package-lock.json` (Playwright, nodemailer…).

```yaml
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps chrome msedge
```
Installs Google Chrome and Microsoft Edge on the Linux machine (`--with-deps` also installs the system libraries they need).

```yaml
    - name: Run Playwright tests
      run: npx playwright test
```
Runs **all** tests: UI tests in the browsers set in `browsers.json`, and the API tests. Playwright starts the demo API server on the CI machine automatically (`webServer` in the config), so API tests need no extra workflow step. GitHub sets the `CI` environment variable, so the config uses **2 retries, 1 worker**, and fails if a `test.only` was left in the code.

```yaml
    - uses: actions/upload-artifact@v4
      if: ${{ !cancelled() }}
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30
```
Uploads the HTML report as a downloadable **artifact**, even when tests failed (`!cancelled()` means "unless the run was cancelled"), kept for 30 days.

## Seeing the results

1. Open the repository on GitHub and click the **Actions** tab.
2. Each run is listed with ✅ (all passed), ❌ (something failed) or 🟡 (still running), plus the commit or pull request that triggered it.
3. Click a run → click the **test** job to see the live console output of every step. Expand **Run Playwright tests** to see which tests failed and why.
4. To see the full HTML report: scroll to the bottom of the run's **Summary** page → **Artifacts** → download **playwright-report** (a zip). Unzip it, then in a terminal in the project folder run:
   ```powershell
   npx playwright show-report <path-to-the-unzipped-folder>
   ```
   Traces from retried tests are included and open from the report.

On a **pull request**, the result also appears at the bottom of the PR as a check. A red ❌ is a signal not to merge until the failure is understood. (To *block* merging on failure, a repository admin can make the check required under **Settings → Branches → Branch protection rules**.)

## How CI differs from your machine

| | Your machine | GitHub Actions |
|---|---|---|
| Operating system | Windows | Linux (Ubuntu) |
| What runs | What you choose (`npm test`, `suite.bat …`) | `npx playwright test`: **all tests**, no suite |
| Retries / workers | 0 / automatic | 2 / 1 |
| Reports | `playwright-report/` or `reports/<suite>/` | `playwright-report/`, uploaded as an artifact |
| Email | Sent by suite runs | **Not sent**: the workflow doesn't run a suite, and has no SMTP login |
| Browser windows | Can be headed | Always headless (no screen) |

A test that passes locally but fails on CI is usually down to **timing** (the CI machine is slower, and runs with 1 worker), **screen size**, or **network access** to the application under test.

## Possible extension: suites and email on CI

The current workflow is the one Playwright generated. It doesn't run suites or send email. If the team wants that, the workflow can be changed along these lines. **This is an example, not the current setup:**

```yaml
name: Regression

on:
  schedule:
    - cron: '30 20 * * *'      # every day at 20:30 UTC (02:00 IST)
  workflow_dispatch:            # adds a "Run workflow" button in the Actions tab

jobs:
  regression:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: lts/*
    - run: npm ci
    - run: npx playwright install --with-deps chrome msedge
    - name: Run regression suite and email the report
      run: npm run suite -- regression          # suite.bat is Windows-only; this works on Linux
      env:
        SMTP_USER: ${{ secrets.SMTP_USER }}
        SMTP_PASS: ${{ secrets.SMTP_PASS }}
    - uses: actions/upload-artifact@v4
      if: ${{ !cancelled() }}
      with:
        name: regression-report
        path: reports/
        retention-days: 30
```

What it would need:
- **Secrets:** in GitHub → **Settings → Secrets and variables → Actions → New repository secret**, add `SMTP_USER` and `SMTP_PASS`. Secrets are encrypted and hidden in logs; never put the password in the workflow file itself.
- **Mail server access from GitHub:** Microsoft 365 must accept SMTP logins from GitHub's servers; some organisations block sign-ins from outside the office network.
- `reportUrl` in `project.json` could point to the Actions run page, so email readers can download the full report.
