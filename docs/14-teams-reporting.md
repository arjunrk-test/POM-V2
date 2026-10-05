# 14. Microsoft Teams reporting

After every suite run, the framework can post the result to a **Microsoft Teams channel** as a card, next to the email. Everyone with access to the channel (developers, QA, business) sees each execution as it happens, and the channel becomes the project's execution history.

```
Run #105   ✅ PASSED            192 tests · 18m 24s · UAT
Run #104   ❌ FAILED  5 failed  192 tests · 19m 03s · UAT
Run #103   ✅ PASSED            ...
```

The framework only **posts** results. It doesn't create channels, manage members or delete messages.

## How it works

```
suite.bat ─► run-suite.js ─► Playwright (each suite) ─► reports/<suite>/results.json
                  │
                  └─► notification-manager.js       (after all suites finish)
                         ├─ run-result.js           same numbers as the email (reuses send-report.js)
                         ├─ run-history.js          Run ID, last 50 runs, duplicate check
                         ├─ email                   existing send-report.js
                         └─ teams-reporter.js       Adaptive Card ─► Teams Workflows webhook ─► channel
```

| File | Role |
|---|---|
| `scripts/notifications/notification-manager.js` | Sends every notification for a finished run. Never throws; never changes the test result. |
| `scripts/notifications/run-result.js` | Builds the result being reported, from the same summary the email uses. |
| `scripts/notifications/teams-reporter.js` | Builds the Adaptive Card and posts it (timeout, limited retries). |
| `scripts/notifications/run-history.js` | Run numbers / Run IDs, the last 50 runs per project, duplicate detection. |
| `scripts/notifications/teams-test.js` | `npm run test:teams`: sends a sample card. |
| `project.json` → `teams` | Which Teams project(s) exist and where their webhook URL is stored (not the URL itself). |
| `.env.local` | The webhook URL (secret, never committed). |

Teams reporting runs for **suite runs** (`.\suite.bat …`), the same as the email. Plain `npm test` runs send nothing.

## What Microsoft supports (checked October 2026)

- **Office 365 Connectors are retired.** The old "Incoming Webhook" connector was switched off on **18–22 May 2026**. The supported replacement is **Teams Workflows** (built on Power Automate), template **"Send webhook alerts to a channel"**, trigger **"When a Teams webhook request is received"**.
- **Licensing:** that template and trigger are **Standard, not Premium**. Microsoft: *"Using these templates and the Teams webhook trigger does not require a premium license."* A normal Microsoft 365 licence that includes Teams is enough. **No Azure, no paid services.**
- **Adaptive Cards** are supported; that's what the framework sends.
- **Channel types:** standard channels ✅, shared channels ✅. **Private channels:** Microsoft's pages disagree. One says posting there "currently isn't supported"; a 2026 announcement (MC1181996) says support is rolling out via the Power Automate portal. **Use a standard channel** (see [setup](#1-the-team-and-channel)).
- **Identity:** cards are posted by **Workflows** (the "Flow bot"). The name and icon can't be changed.
- **Limits:** about **28 KB per message** (our cards are 3–5 KB). Throttling above about 4 requests a second, and about 25 Flow-bot posts per 5 minutes per connection. One post per run is far below that.
- **No edit or delete through the webhook.** Workflows has no "delete message" action. Microsoft Graph's delete (`softDelete`) works only with a signed-in user, never as an unattended application. That's why the framework never edits or deletes earlier posts (see [history](#history-and-retention-the-last-50-runs)).
- **The webhook URL is a secret.** Anyone who has it can post to the channel. It looks like `https://<id>.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/…&sig=…`.
- **Workflow ownership:** a workflow belongs to the person who created it. If they leave the organisation and there's no co-owner, it stops working. **Add a co-owner** (step 3 below).

## Setup

### 1. The team and channel

Do this once, manually, in Teams:

1. Create a team for the project, e.g. **QA Reports** (this project's team), as a **Private team** (Teams → *Join or create a team* → *Create team* → privacy **Private**). Only people you add can see it, which covers the "not everyone in the company" requirement.
2. Add the project's **developers, QA and business** members to the team.
3. In that team, add a **standard** channel named **RM HUB - QA**.

> Why a standard channel in a private team, not a private channel: everyone in the team sees it, nobody outside the team does, and it's fully supported by Workflows webhooks. Private channels are only partly supported (see above).

### 2. The workflow (creates the webhook URL)

1. In Teams, hover over **RM HUB - QA** → **⋯ (More options)** → **Workflows**.
2. Search for and select **Send webhook alerts to a channel**.
3. Give it a name, e.g. *Automation results → RM HUB - QA*, sign in if asked, then **Next**.
4. Check that **Team** = *QA Reports* and **Channel** = *RM HUB - QA* → **Add workflow** / **Save**.
5. **Copy the webhook URL** shown at the end. Treat it like a password.

### 3. Add a co-owner (recommended)

So the workflow keeps working if you leave or change roles: open <https://make.powerautomate.com> → **My flows** → the workflow → **Edit** (Share) → add a colleague (or the team) as **co-owner**.

### 4. Give the URL to the framework

Add one line to **`.env.local`** in the project root (the same file as the SMTP login; it's git-ignored):

```
TEAMS_RM_HUB_QA_WEBHOOK_URL=https://...the URL you copied...
```

On CI, add it as a secret with the same name instead (GitHub → Settings → Secrets and variables → Actions).

### 5. Check `project.json`

The `teams` section is already there:

```json
"teams": {
  "enabled": true,
  "project": "rmhubqa",
  "historySize": 50,
  "retries": 3,
  "timeoutMs": 15000,
  "projects": {
    "rmhubqa": {
      "displayName": "RM HUB - QA",
      "webhookUrlEnv": "TEAMS_RM_HUB_QA_WEBHOOK_URL",
      "reportUrl": ""
    }
  }
}
```

| Field | Meaning |
|---|---|
| `enabled` | `true` / `false`: Teams reporting on or off (the `TEAMS_ENABLED` environment variable overrides it). |
| `project` | The Teams project suites report to by default. |
| `historySize` | How many runs the framework's own history keeps per project (default 50). |
| `retries` | Attempts per post for temporary failures (network errors, timeouts, 408, 429, 5xx). Other errors aren't retried. |
| `timeoutMs` | How long to wait for Teams per attempt. |
| `projects.<key>.displayName` | The project name shown on the card. |
| `projects.<key>.webhookUrlEnv` | The **name** of the environment variable that holds the webhook URL. The URL itself never goes in this file. |
| `projects.<key>.reportUrl` | Optional link to where the reports are published (shared drive, web server, CI). Shown as a **📊 Detailed Report** button. |

### 6. Send a test card

```powershell
npm run test:teams
```

A sample **FAILED** card should appear in the channel within a few seconds. Other samples:

```powershell
npm run test:teams -- --status=passed      # passed | failed | partial | error
npm run test:teams -- --dry-run            # build the card in reports/teams/ without sending
```

To preview a card without Teams, open a dry-run file and paste its `content` object into the **Adaptive Cards Designer**: <https://adaptivecards.microsoft.com/designer>.

## Using it

Nothing changes in how you run tests:

```powershell
.\suite.bat smoke                    # posts one card for the run
.\suite.bat --all                    # posts ONE card covering every suite (plus one combined email)
```

| Option | Effect |
|---|---|
| `--no-teams` | Don't post to Teams for this run (email still sent). |
| `--teams-dry-run` | Build the card into `reports/teams/<Run ID>.json` instead of posting it. |
| `--no-email` / `--email-dry-run` | Same as before; independent of Teams. |

**Turn Teams off** without editing files: `$env:TEAMS_ENABLED="false"` (PowerShell) before running, or set `"enabled": false` in `project.json`. Tests and email run normally; the log says `[Teams] Disabled …; skipping.`

**Re-send** the notifications for the latest results of some suites, e.g. after fixing a broken webhook, without running tests again:

```powershell
npm run notify -- smoke regression api --no-email
```

Results that were already posted are **not posted twice**; add `--force` to post anyway.

## The card

- **Header** coloured by status: ✅ **PASSED** (green), ❌ **FAILED** (red), ⚠️ **PARTIAL** (amber), 🚨 **EXECUTION ERROR** (red).
- **Counts:** total, passed, failed, flaky, skipped.
- **Details:** project, application, environment, browsers, suites, duration, started, completed (local time with time zone), **Run ID**.
- **Suites:** per-suite result, when the run had several suites.
- **Failed tests:** the first 5, with browser, suite and the first line of the error.
- **Report:** a **📊 Detailed Report** button if `reportUrl` is set, and a **🔗 CI run** button when running in GitHub Actions or Jenkins. Otherwise the card names the report's location on the machine that ran the tests, and says it's attached to the email. **It never shows a link that people can't open.**

### Status rules

The status is worked out from the actual results:

| Status | When |
|---|---|
| ✅ PASSED | Every test passed (flaky tests passed on retry and count as passed). |
| ❌ FAILED | At least one test failed. |
| ⚠️ PARTIAL | Nothing failed, but some tests were skipped. |
| 🚨 EXECUTION ERROR | The run itself broke: a suite produced no results, no tests ran, Playwright exited with an error although no test failed (e.g. the demo API server couldn't start), or the run couldn't start at all (e.g. a suite file lists a test that doesn't exist). |

> The email headline only says PASSED or FAILED, so a run with skipped tests is "PASSED" in the email and "PARTIAL" in Teams.

### Run ID

Every run gets a unique ID like **`RMHUBQA-20261005-00105`**: project key, date, and the run number.
- On **GitHub Actions** / **Jenkins** the run number is the CI build number (`GITHUB_RUN_NUMBER` / `BUILD_NUMBER`), so it matches the CI run.
- Locally it's the next number in the project's history file.
- You can force one with the `RUN_NUMBER` environment variable.

The same Run ID appears in the console, on the Teams card, in the email (*Run ID* row) and in the history file.

## History and retention ("the last 50 runs")

- **In Teams:** every run adds a new card, so the channel **is** the execution history. Earlier cards are never edited or deleted, because the webhook can't do that reliably (see [above](#what-microsoft-supports-checked-october-2026)). Teams keeps channel messages until your organisation's retention policy removes them; by default that's indefinitely.
- **In the framework:** `reports/history/<project>.json` keeps a structured record of the **last 50 runs** (`historySize`): Run ID, status, counts, suites, times, environment, and whether email and Teams were notified. Older entries are dropped automatically.
- If you need the **channel itself** trimmed, an admin can apply a Microsoft Purview **retention policy** to the team. Those are time-based (e.g. "delete after 90 days"), not count-based, and need admin rights and compliance licensing. That's outside the framework.

`reports/` is git-ignored, so each machine has its own history. On CI, where every run starts on a clean machine, the CI build number keeps the Run IDs unique.

## Duplicate protection

- A notification is identified by the exact results files it reports on. Notifying the **same results** again (`npm run notify`, or the manager being called twice) reuses the same Run ID, and Teams is **skipped** if that run was already posted: `[Teams] Already posted for run …; not posting again`.
- A **new execution** writes new results and is always a new post. Running the suite twice means two real runs, so two cards.

## Failures never affect the test result

Teams problems are logged and the run carries on. The exit code always reflects only the tests:

```
[Teams] Sending result...
[Teams] Attempt 1 failed (HTTP 503 Service Unavailable); retrying in 2s...
[Teams] Failed to send notification
[Teams] HTTP Status: 404
[Teams] Reason: HTTP 404 Not Found: ...
[Teams] Check that the workflow still exists and is turned on, and that TEAMS_RM_HUB_QA_WEBHOOK_URL holds its current URL.
[Teams] Test execution result is unaffected
```

| Problem | What happens |
|---|---|
| Network error, timeout, 408, 429, 5xx | Retried up to `retries` times (2 s, then 4 s; `Retry-After` honoured up to 30 s), then logged. |
| 400 / 401 / 403 / 404 (bad payload, deleted or disabled workflow, wrong URL) | Not retried; logged with a hint. |
| Variable not set | `[Teams] No webhook URL: set TEAMS_RM_HUB_QA_WEBHOOK_URL …; skipping.` |
| Invalid URL | `The webhook URL is not a valid https:// URL`. |

**The webhook URL is never printed** in logs, reports or history.

> **"Sent" means Teams accepted the request** (HTTP 202). The workflow posts the card a moment later. If a card never appears, open the **Workflows** app → your workflow → **run history** to see the error.

## Adding Project 2 (and more)

No code changes are needed:

1. **In Teams:** create the team and channel, and a workflow for it ([steps 1–3](#setup)).
2. **In `.env.local`** (and CI secrets): `TEAMS_PROJECT2_WEBHOOK_URL=https://...`
3. **In `project.json`**, add the project:
   ```json
   "projects": {
     "rmhubqa": { "displayName": "RM HUB - QA", "webhookUrlEnv": "TEAMS_RM_HUB_QA_WEBHOOK_URL", "reportUrl": "" },
     "project2": { "displayName": "Project 2", "webhookUrlEnv": "TEAMS_PROJECT2_WEBHOOK_URL", "reportUrl": "" }
   }
   ```
4. **Point suites at it**, either:
   - **per suite:** add `"teamsProject": "project2"` to a suite file in `test-plans/suites/`, or
   - **for the whole repository** (if it belongs to Project 2): set `"project": "project2"`.
5. **Check:** `npm run test:teams -- --project=project2`.

If one run includes suites of different projects (e.g. `.\suite.bat --all`), each project gets **its own card** with its own Run ID, in its own channel.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `[Teams] No webhook URL: set TEAMS_RM_HUB_QA_WEBHOOK_URL …` | Add the line to `.env.local` (exact name, no quotes needed). |
| `HTTP Status: 404` | The workflow was deleted, or the URL is old. Copy the current URL from the workflow (Workflows app → the workflow → edit the trigger). |
| `HTTP Status: 401` / `403` | The workflow is set to accept only signed-in users. Recreate it from the **Send webhook alerts to a channel** template (accepts anyone with the URL). |
| "Sent", but no card in the channel | Open the workflow's **run history** in the Workflows app; a failed run shows why (e.g. the channel was renamed or deleted, or the owner lost access). |
| Card posted to a private channel doesn't appear | Use a standard channel (see [channel types](#what-microsoft-supports-checked-october-2026)). |
| `[Teams] Disabled …` | `TEAMS_ENABLED` is set to `false` (check with `echo $env:TEAMS_ENABLED`), or `"enabled": false` in `project.json`. |
| `[Teams] Already posted for run …` | Those results were already posted; use `--force` to post again. |
| Workflow stopped working after someone left | Add a co-owner; ask an admin to reassign it ("orphaned flow"). |

## Sources

- [Create an Incoming Webhook (Teams platform docs)](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook)
- [Microsoft Teams connector reference: webhook trigger, limits, private channels](https://learn.microsoft.com/en-us/connectors/teams/)
- [Send messages in Teams using incoming webhooks (licensing note)](https://support.microsoft.com/en-us/office/send-messages-in-teams-using-incoming-webhooks-323660ec-12ca-40b1-a1d3-a3df47e808c4)
- [Retirement of Office 365 connectors within Microsoft Teams](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/)
- [MC1181996: Migration update for Office 365 connectors retirement](https://mc.merill.net/message/MC1181996)
- [chatMessage: softDelete (Graph; application permissions not supported)](https://learn.microsoft.com/en-us/graph/api/chatmessage-softdelete)
- [Power Automate trigger URLs moving to api.powerplatform.com](https://blog-en.topedia.com/2025/10/http-and-teams-webhook-trigger-urls-must-be-updated-in-power-automate-and-copilot-studio-agent-flows/)
