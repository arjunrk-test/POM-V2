// Sends every notification for a finished run: the email (existing send-report.js)
// and Microsoft Teams (teams-reporter.js), and records the run in the history.
//
//   run-suite.js ──► notifyRunComplete() ──┬─► email      (one email per run, as before)
//                                          ├─► Teams      (one card per Teams project)
//                                          └─► history    (reports/history/<project>.json)
//
// Notifications NEVER change the test result: every step is isolated, errors are logged
// and swallowed, and this function never throws.
//
// Which Teams project a suite reports to: the suite file's "teamsProject", else
// teams.project in project.json. Suites of different projects in one run produce one
// card per project.
//
// Re-send the notifications for the latest results of some suites (e.g. after fixing
// the webhook) without running tests again:
//   npm run notify -- smoke regression api [--no-email] [--no-teams] [--force] [--dry-run]
// The same results are never posted to Teams twice unless --force is given.

const fs = require('fs');
const path = require('path');
const { sendReport, sendCombinedReport, loadProject } = require('../send-report');
const { buildRunResult } = require('./run-result');
const { buildPayload, postToWebhook } = require('./teams-reporter');
const { loadHistory, saveHistory, nextRunNumber, makeRunId, fingerprint } = require('./run-history');

const ROOT = path.resolve(__dirname, '..', '..');
const SUITES_DIR = path.join(ROOT, 'test-plans', 'suites');
const TEAMS_OUT = path.join(ROOT, 'reports', 'teams');
const log = (message) => console.log(`[Teams] ${message}`);

/** Teams settings from project.json, with TEAMS_ENABLED overriding "enabled". */
function teamsSettings(project) {
  const teams = project.teams ?? {};
  const env = (process.env.TEAMS_ENABLED ?? '').trim().toLowerCase();
  const enabled = env ? !['false', '0', 'no', 'off'].includes(env) : teams.enabled === true;
  return { ...teams, enabled, projects: teams.projects ?? {} };
}

/** The Teams project key of a suite: its "teamsProject", else the default. */
function projectKeyOf(suiteName, teams) {
  try {
    const suite = JSON.parse(fs.readFileSync(path.join(SUITES_DIR, `${suiteName}.json`), 'utf-8'));
    if (suite.teamsProject) return suite.teamsProject;
  } catch {
    // unreadable suite: use the default
  }
  return teams.project || 'default';
}

/**
 * Posts one RunResult to its Teams project. Returns the outcome for the history:
 * 'sent' | 'failed' | 'disabled' | 'not-configured' | 'duplicate' | 'dry-run'.
 */
async function notifyTeams(runResult, { teams, previous, dryRun, force }) {
  if (!teams.enabled) {
    log(`Disabled (${process.env.TEAMS_ENABLED !== undefined ? 'TEAMS_ENABLED' : 'teams.enabled in project.json'}); skipping.`);
    return 'disabled';
  }
  const key = runResult.project.key;
  const config = teams.projects[key];
  log('Preparing automation result...');
  log(`Project: ${runResult.project.displayName} (${key})`);
  log(`Run ID: ${runResult.runId}`);
  log(`Status: ${runResult.status.toUpperCase()}`);

  if (!config) {
    log(`No Teams project "${key}" in project.json (teams.projects); skipping.`);
    return 'not-configured';
  }
  if (previous?.notifications?.teams === 'sent' && !force) {
    log(`Already posted for run ${runResult.runId}; not posting again (use --force to override).`);
    return 'duplicate';
  }

  const payload = buildPayload(runResult);
  if (dryRun) {
    fs.mkdirSync(TEAMS_OUT, { recursive: true });
    const file = path.join(TEAMS_OUT, `${runResult.runId}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    log(`Dry run: card saved to ${path.relative(ROOT, file)} (not sent). Preview it at https://adaptivecards.microsoft.com/designer`);
    return 'dry-run';
  }

  const envName = config.webhookUrlEnv;
  const webhookUrl = envName ? process.env[envName] : '';
  if (!webhookUrl) {
    log(`No webhook URL: set ${envName || 'webhookUrlEnv'} in .env.local (or as a CI secret); skipping.`);
    return 'not-configured';
  }

  log('Sending result...');
  const result = await postToWebhook(webhookUrl, payload, { attempts: teams.retries ?? 3, timeoutMs: teams.timeoutMs ?? 15000, log });
  if (result.ok) {
    log(`Notification sent successfully (HTTP ${result.status}${result.attempts > 1 ? `, after ${result.attempts} attempts` : ''}).`);
    return 'sent';
  }
  log('Failed to send notification');
  if (result.status) log(`HTTP Status: ${result.status}`);
  log(`Reason: ${result.error}`);
  if (result.status === 404 || result.status === 401 || result.status === 403) {
    log(`Check that the workflow still exists and is turned on, and that ${envName} holds its current URL.`);
  }
  log('Test execution result is unaffected');
  return 'failed';
}

/**
 * Sends all notifications for a run. Never throws.
 * @param {{
 *   suiteNames: string[],
 *   exitCodes?: Record<string, number>,
 *   error?: string,               the run couldn't start (e.g. a broken suite file): Teams gets an ERROR card
 *   email?: boolean, teams?: boolean, force?: boolean,
 *   emailDryRun?: boolean, teamsDryRun?: boolean,   build the email / card without sending it
 * }} options
 */
async function notifyRunComplete({ suiteNames, exitCodes = {}, error, email = true, teams: teamsOn = true, emailDryRun = false, teamsDryRun = false, force = false }) {
  try {
    if (fs.existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile(path.join(ROOT, '.env.local'));
    const project = loadProject();
    const teams = teamsSettings(project);
    if (!teamsOn) teams.enabled = false;

    // Group the suites by Teams project and give each group a Run ID.
    /** @type {Map<string, string[]>} */
    const groups = new Map();
    for (const name of suiteNames) {
      const key = projectKeyOf(name, teams);
      groups.set(key, [...(groups.get(key) ?? []), name]);
    }

    const runs = [];
    for (const [key, names] of groups) {
      const history = loadHistory(key);
      const print = error ? `error-${Date.now()}` : fingerprint(names);
      // The same results notified again (e.g. npm run notify) keep their Run ID.
      const previous = history.runs.find((r) => r.fingerprint === print);
      const runNumber = previous?.runNumber ?? nextRunNumber(history);
      const runId = previous?.runId ?? makeRunId(key, new Date(), runNumber);
      const config = teams.projects[key] ?? {};
      // A resend has no exit codes of its own: reuse the ones recorded for that run.
      const codes = Object.keys(exitCodes).length ? exitCodes : (previous?.exitCodes ?? {});
      const runResult = buildRunResult({
        suiteNames: names, exitCodes: codes, project, error, runId, runNumber,
        teamsProject: { key, displayName: config.displayName, reportUrl: config.reportUrl },
      });
      runs.push({ key, names, history, previous, print, runResult, codes });
    }
    for (const run of runs) console.log(`Run ID: ${run.runResult.runId} (${run.runResult.status.toUpperCase()})`);

    // Email: one per run, as before (not when the run couldn't start).
    let emailOutcome = 'skipped';
    if (error) {
      // nothing ran, so there are no results to email
    } else if (!email) {
      console.log('Email: skipped (--no-email).');
    } else {
      const runId = runs.map((r) => r.runResult.runId).join(', ');
      const ok = suiteNames.length === 1
        ? await sendReport(suiteNames[0], { dryRun: emailDryRun, runId })
        : await sendCombinedReport(suiteNames, { dryRun: emailDryRun, runId });
      emailOutcome = emailDryRun ? 'dry-run' : ok ? 'ok' : 'failed';
    }

    // Teams: one card per project; then record each run in its project's history.
    for (const run of runs) {
      let teamsOutcome = 'failed';
      try {
        teamsOutcome = await notifyTeams(run.runResult, { teams, previous: run.previous, dryRun: teamsDryRun, force });
      } catch (e) {
        log(`Failed to send notification: ${/** @type {Error} */ (e).message}`);
        log('Test execution result is unaffected');
      }
      // A resend only updates the channels it actually tried: a skipped email, a disabled
      // Teams or a duplicate keep the outcome recorded earlier for this run.
      const earlier = run.previous?.notifications ?? {};
      const emailRecorded = emailOutcome === 'skipped' && earlier.email ? earlier.email : emailOutcome;
      const teamsRecorded = ['duplicate', 'disabled'].includes(teamsOutcome) && earlier.teams ? earlier.teams : teamsOutcome;
      try {
        const { runResult, history, print, key, codes } = run;
        const entry = {
          runId: runResult.runId,
          runNumber: runResult.runNumber,
          status: runResult.status,
          totals: runResult.totals,
          suites: runResult.suites.map(({ name, status, total, passed, failed, flaky, skipped, durationMs }) => ({ name, status, total, passed, failed, flaky, skipped, durationMs })),
          startTime: runResult.startTime,
          endTime: runResult.endTime,
          durationMs: runResult.durationMs,
          environment: runResult.project.environment,
          error: runResult.errorMessage || undefined,
          fingerprint: print,
          exitCodes: codes,
          notifications: { email: emailRecorded, teams: teamsRecorded },
        };
        const index = history.runs.findIndex((r) => r.runId === entry.runId);
        if (index >= 0) history.runs[index] = { ...history.runs[index], ...entry };
        else history.runs.push(entry);
        history.lastRunNumber = Math.max(history.lastRunNumber, runResult.runNumber);
        saveHistory(key, history, teams.historySize ?? 50);
      } catch (e) {
        console.error(`History: could not save (${/** @type {Error} */ (e).message}); notifications are unaffected.`);
      }
    }
  } catch (e) {
    console.error(`Notifications: unexpected error, skipped (${/** @type {Error} */ (e).message}). Test results are unaffected.`);
  }
}

module.exports = { notifyRunComplete, teamsSettings };

if (require.main === module) {
  const args = process.argv.slice(2);
  const names = args.filter((a) => !a.startsWith('-'));
  if (!names.length) {
    console.error('Usage: npm run notify -- <suite> [<suite> ...] [--no-email] [--no-teams] [--force] [--dry-run]');
    process.exit(1);
  }
  notifyRunComplete({
    suiteNames: names,
    email: !args.includes('--no-email'),
    teams: !args.includes('--no-teams'),
    force: args.includes('--force'),
    emailDryRun: args.includes('--dry-run'),
    teamsDryRun: args.includes('--dry-run'),
  }).then(() => process.exit(0));
}
