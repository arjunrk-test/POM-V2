# 8. Email reports

After every suite run, the results are emailed to the project's mailing list. This guide explains the email, `project.json` (who gets it and how it's sent), the SMTP login, and how to test and troubleshoot it.

## What the email contains

**Subject**, for example:
```
[OrangeHRM QA] regression suite PASSED: 2/2 passed
[OrangeHRM QA] smoke suite FAILED: 4/6 passed, 2 failed
```

**Body**, top to bottom:
1. **Title and headline:** project, suite, and a green *PASSED* or red *FAILED* line with the counts.
2. **Run details:** environment, application URL, start time, duration.
3. **Charts:**
   - *Overall result*: a donut with the pass rate in the middle, plus passed / failed / flaky / skipped counts and percentages.
   - *Results by browser*: one bar per browser, split by result.
   - *Test duration*: test runs from slowest to fastest (the 8 slowest when there are more).
4. **By browser** table: the same numbers as the chart, in a table.
5. **Failed tests** table (only when something failed): test title, file, browser, and the first line of the error.
6. **Report link**, if `reportUrl` is set.

**Attachments:**
- `<suite>-dashboard.html`: the dashboard (open it in a browser for charts, the timeline, and every test's steps, errors and screenshots). See [Reports](07-reports.md#the-dashboard-start-here).
- `<suite>-playwright-report.html`: the built-in Playwright HTML report.
- `<suite>-results.xml`: the JUnit XML.

Colours in the charts: green = passed, red = failed, amber = flaky, grey = skipped. Each colour always has its text label next to it.

## `project.json`

Lives in the project root. Current content:

```json
{
  "projectName": "OrangeHRM",
  "description": "UI automation for the OrangeHRM web application",
  "team": "QA Automation",
  "environment": "QA",
  "applicationUrl": "https://opensource-demo.orangehrmlive.com",

  "email": {
    "enabled": true,
    "sendOn": "always",
    "from": "QA Automation <arjun.s@mxtechies.com>",
    "to": ["..."],
    "cc": [],
    "bcc": [],
    "subjectPrefix": "[OrangeHRM QA]",
    "charts": true,
    "attachReports": true,
    "maxAttachmentMB": 10,
    "reportUrl": "",
    "smtp": {
      "host": "smtp.office365.com",
      "port": 587,
      "secure": false
    }
  }
}
```

### Project fields

| Field | Used for |
|---|---|
| `projectName` | Email title ("OrangeHRM: smoke suite") |
| `description` | Documentation only |
| `team` | Email footer ("Sent automatically by the QA Automation framework") |
| `environment` | "Environment" row in the email (QA, UAT, Staging…) |
| `applicationUrl` | "Application" row in the email |

> These fields only describe the run in the email. They **don't** change where tests go: the URLs tests open come from `utilities/globalUrl.js`. If you point the tests at a different environment, update `environment` and `applicationUrl` too, so the email says the right thing.

### Email fields

| Field | Values | Meaning |
|---|---|---|
| `enabled` | `true` / `false` | `false` turns all report emails off. |
| `sendOn` | `"always"` / `"failure"` | `"always"`: email after every run. `"failure"`: only when at least one test failed. A good fit for nightly runs, where "no news is good news". |
| `from` | `"Name <address>"` | Sender shown to recipients. With Microsoft 365 the **address must be the same as `SMTP_USER`** (or one it's allowed to send as), otherwise Microsoft rejects the email. The name part is free text. |
| `to` | list of addresses | Main recipients. At least one is required. |
| `cc` | list | Copy recipients. |
| `bcc` | list | Hidden copy recipients. |
| `subjectPrefix` | text | Put at the start of the subject, so people can create Outlook rules/filters for these emails. |
| `charts` | `true` / `false` | Include the charts. |
| `attachReports` | `true` / `false` | Attach the dashboard, the Playwright HTML report and the JUnit XML. |
| `maxAttachmentMB` | number | Any report file bigger than this isn't attached; the email says so instead. Most mail servers reject emails over ~20–25 MB. |
| `reportUrl` | URL or `""` | Optional link to where the full reports are hosted (a Jenkins job, a shared drive, a CI run page). Shown as "Full report: …". |
| `smtp.host` | host name | The mail server. |
| `smtp.port` | number | Usually `587` (with `secure: false`) or `465` (with `secure: true`). |
| `smtp.secure` | `true` / `false` | `false` for port 587: the connection is upgraded to encrypted (STARTTLS). `true` for port 465: encrypted from the start. |

### Changing the mailing list
Edit `to` / `cc` / `bcc`:
```json
"to": ["qa-lead@mxtechies.com", "dev-team@mxtechies.com"],
"cc": ["manager@mxtechies.com"],
```
Remember the JSON rules: double quotes, commas between items, no comma after the last one. **Remove placeholder addresses** like `@example.com`: they don't exist, and each one makes Outlook send the sender a "delivery failed" message every run.

## SMTP login (`.env.local`)

The password is **not** in `project.json` (that file is committed to git, so everyone would see it). It lives in `.env.local` in the project root, which is git-ignored:

```
SMTP_USER=arjun.s@mxtechies.com
SMTP_PASS=the-password
```

- `SMTP_USER` is the mailbox that sends the email (the same address as in `from`).
- `SMTP_PASS` is that mailbox's password.

Environment variables with the same names override the file, which is how CI provides them (see [CI](09-ci-github-actions.md)).

### Which password? (Microsoft 365)
- **Normal sign-in (password only):** your normal Microsoft account password, the one you use for Outlook/Teams.
- **Multi-factor sign-in (codes / Authenticator):** your normal password will be rejected. Create an **app password** at <https://mysignins.microsoft.com/security-info> → *Add sign-in method* → *App password*, and use that. If "App password" isn't offered, your admin has disabled it; ask IT.
- **Your organisation has turned off password login for SMTP** (Microsoft is phasing this out): no password works. IT must enable "Authenticated SMTP" for the mailbox, or provide OAuth app credentials (the code would need changing to use them).

### Other mail providers
| Provider | `host` | `port` | `secure` | Password |
|---|---|---|---|---|
| Microsoft 365 / Outlook | `smtp.office365.com` | 587 | `false` | Account password or app password |
| Gmail / Google Workspace | `smtp.gmail.com` | 587 | `false` | An app password (requires 2-step verification) |
| Your company's own server | ask IT | ask IT | ask IT | ask IT |

### Testing the login without sending anything
```powershell
node -e "process.loadEnvFile('.env.local'); const s=require('./project.json').email.smtp; require('nodemailer').createTransport({host:s.host,port:s.port,secure:s.secure,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}).verify().then(()=>console.log('LOGIN OK')).catch(e=>console.log('LOGIN FAILED:', e.response||e.message))"
```
`LOGIN OK` means the server accepted the username and password.

## Commands

| Command | What it does |
|---|---|
| `.\suite.bat smoke` | Runs the suite and sends the email |
| `.\suite.bat smoke --no-email` | Runs the suite, no email |
| `.\suite.bat smoke --email-dry-run` | Runs the suite and builds the email, but doesn't send it. Open `reports/smoke/email.html` to preview. |
| `npm run send-report -- smoke` | Sends the email for the **last** smoke run again, without re-running tests (e.g. after fixing the password or the mailing list) |
| `npm run send-report -- smoke --dry-run` | Rebuilds the preview for the last smoke run without sending |

## What you'll see in the console

| Message | Meaning |
|---|---|
| `Email: sent "<subject>" to <addresses>` | Sent successfully. |
| `Email (dry run, not sent): ...` | Dry run; preview saved. |
| `Email: skipped (--no-email).` | You used `--no-email`. |
| `Email: disabled in project.json, not sending.` | `enabled` is `false`. |
| `Email: all tests passed and sendOn is "failure", not sending.` | Working as configured. |
| `Email: NOT sent. SMTP_USER and SMTP_PASS are not set. Fill them in in .env.local.` | `.env.local` is missing, or one of the two lines is empty. |
| `Email: NOT sent. Invalid login: 535 5.7.139 Authentication unsuccessful...` | Wrong password, or password login isn't allowed. See [Which password?](#which-password-microsoft-365) |
| `Email: NOT sent. ... "email.to" needs at least one address` | `to` is empty in `project.json`. |
| `Email: NOT sent. ... "email.sendOn" must be "always" or "failure"` | Typo in `sendOn`. |
| `Email: NOT sent. No results found at ...results.json` | `send-report` was run for a suite that hasn't been run yet. |
| `Email: charts could not be drawn, sending without them.` | No browser could be started to draw the charts; the email is still sent, with tables only. |

**An email failure never changes the run's result.** If the tests passed but the email failed, the run still exits with 0; fix the problem and use `npm run send-report -- <suite>` to send it.

## How it works (for the curious)

1. `scripts/run-suite.js` calls `sendReport(suite)` from `scripts/send-report.js` after the tests finish.
2. `send-report.js` reads `reports/<suite>/results.json` and counts passed / failed / flaky / skipped tests in total and per browser, and collects the failed tests and every test's duration.
3. `scripts/report-charts.js` draws each chart as SVG, opens it in a headless browser (installed Chrome, else Edge, else Playwright's Chromium) and saves a screenshot as PNG in `reports/<suite>/charts/`. This is done because email programs don't run JavaScript and Outlook can't display SVG, but every email program shows images.
4. The images are embedded in the email (as "inline" images referenced by `cid:`), so they appear in the body rather than as attachments, and recipients don't need to click "download pictures".
5. The email is sent with [nodemailer](https://nodemailer.com) through the SMTP server in `project.json`.

## Limits to know

- The attached dashboard includes screenshots (if tests take them), but neither attachment includes **traces**. Traces stay on the machine that ran the suite, in `reports/<suite>/html/data/`, and the dashboard's *Open in Playwright report* links only work from that folder. To share them, host the reports somewhere (shared drive, CI) and set `reportUrl`.
- Every run of a suite overwrites `reports/<suite>/`, so `send-report` can only re-send the latest run.
