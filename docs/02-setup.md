# 2. Setup

This guide takes you from a fresh machine to a successful first test run. It's written for **Windows**, which is what the team uses; the commands work the same on macOS/Linux except `suite.bat` (use `npm run suite -- <name>` there).

## What you need

| Tool | Version | Why | Check with |
|---|---|---|---|
| **Node.js** | 20.12 or newer (22 or 24 LTS recommended) | Runs Playwright and the scripts | `node -v` |
| **npm** | Comes with Node.js | Installs packages, runs scripts | `npm -v` |
| **Git** | Any recent version | Gets the code | `git --version` |
| **Google Chrome** | Installed normally | Tests marked `chrome` run in it | Open Chrome |
| **Microsoft Edge** | Comes with Windows | Tests marked `edge` run in it | Open Edge |
| **VS Code** (recommended) | Any | Editing, plus the Playwright extension | |

> **Why "installed" Chrome and Edge?** The framework runs tests in the real, branded Chrome and Edge your users have, not Playwright's own "Chromium" build. So both must be installed on the machine that runs the tests.

### Installing Node.js
1. Download the **LTS** installer from <https://nodejs.org>.
2. Run it with the default options.
3. Close and reopen your terminal, then check: `node -v` should print `v22.x` or newer.

## Step 1: Get the code

```powershell
git clone git@github.com:arjunrk-test/POM-V2.git
cd POM-V2
```

(If you don't have SSH access set up, ask the team for access to the repository, or use the HTTPS URL from the GitHub page.)

## Step 2: Install the dependencies

```powershell
npm ci
```

This reads `package-lock.json` and installs exactly the versions the project uses into `node_modules/`:
- `@playwright/test`: Playwright and its test runner
- `nodemailer`: sends the report email
- `@types/node`: editor auto-complete for Node.js

> Use `npm ci` (not `npm install`) for setup: it installs exactly what's locked and never changes `package-lock.json`. Run it again whenever someone changes `package.json`.

## Step 3: Make sure Chrome and Edge are available

On a normal Windows PC both are usually already installed (Edge always is). If Chrome is missing, either install it normally from <https://www.google.com/chrome>, or let Playwright install it:

```powershell
npx playwright install chrome
```

(`npx playwright install msedge` does the same for Edge, which is only needed on machines without it, such as Linux build servers.)

## Step 4: Set up your email login (optional)

You need this only if you'll run suites **and** want the report email to be sent from your machine. Skip it for now if you just want to run tests; use `--no-email` when running suites.

Create a file named `.env.local` in the project root (next to `package.json`) with:

```
SMTP_USER=your.name@mxtechies.com
SMTP_PASS=your-password
```

- `SMTP_USER` is the email account that sends the report.
- `SMTP_PASS` is that account's password: the one you use for Outlook/Teams. If your account uses multi-factor sign-in (codes or Authenticator approvals), you need an **app password** instead. See [Email reports](08-email-reports.md#smtp-login-envlocal).

`.env.local` is listed in `.gitignore`, so it is **never committed**. Never put the password anywhere else (not in `project.json`, not in chat, not in code).

## Step 5: Check that everything works

**1. List the tests** (fast, opens no browser):

```powershell
npm run test:list
```

Expected output, similar to:

```
Listing tests:
  [chrome] › example.spec.js:6:5 › user can log in with valid credentials
  [edge] › example.spec.js:6:5 › user can log in with valid credentials
Total: 2 tests in 1 file
```

If this works, Node, Playwright, `browsers.json` and the config are all fine.

**2. Run the tests:**

```powershell
npm test
```

Playwright opens Chrome and Edge in the background (you won't see them, they run "headless") and runs the tests. At the end you see a summary like `2 passed`. If a test failed, the HTML report opens automatically in your browser.

**3. Run a suite without email:**

```powershell
.\suite.bat smoke --no-email
```

**4. (Optional) Run a suite with email**, once `.env.local` is set up and you've put your own address in `"to"` in `project.json`:

```powershell
.\suite.bat smoke
```

The last line should say `Email: sent "..."`.

## Recommended: VS Code Playwright extension

Install **"Playwright Test for VSCode"** (by Microsoft) from the Extensions panel. It lets you:
- run or debug a single test by clicking the green ▶ next to it,
- pick a browser project (chrome / edge) to run in,
- record new tests by clicking in a browser ("Record new").

## Keeping up to date

When you pull new changes:

```powershell
git pull
npm ci          # only needed if package.json / package-lock.json changed
```

## Next step

Read [Writing tests](03-writing-tests.md).
