// Sends a SAMPLE result card to a Teams project's channel, without running any tests,
// so you can check the webhook and how the card looks.
//
//   npm run test:teams                                  sample FAILED card to the default project
//   npm run test:teams -- --status=passed               passed | failed | partial | error
//   npm run test:teams -- --project=project2            another Teams project from project.json
//   npm run test:teams -- --dry-run                     save the card to reports/teams/ instead of sending
//
// Uses the same card builder and sender as real runs. Doesn't touch the run history.

const fs = require('fs');
const path = require('path');
const { loadProject } = require('../send-report');
const { teamsSettings } = require('./notification-manager');
const { buildPayload, postToWebhook } = require('./teams-reporter');
const { makeRunId } = require('./run-history');

const ROOT = path.resolve(__dirname, '..', '..');
const log = (message) => console.log(`[Teams] ${message}`);
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

function sampleResult(status, key, config, project) {
  const totals = {
    passed: { total: 192, passed: 190, failed: 0, flaky: 2, skipped: 0 },
    failed: { total: 192, passed: 187, failed: 5, flaky: 0, skipped: 0 },
    partial: { total: 192, passed: 180, failed: 0, flaky: 0, skipped: 12 },
    error: { total: 150, passed: 150, failed: 0, flaky: 0, skipped: 0 },
  }[status];
  const end = new Date();
  const start = new Date(end.getTime() - (19 * 60 + 3) * 1000);
  const failures = status === 'failed'
    ? [
      { suite: 'regression', title: 'Login › user can log in with valid credentials', browser: 'chrome', error: 'Error: expect(page).toHaveURL(expected) failed' },
      { suite: 'regression', title: 'Employees › admin can add an employee', browser: 'edge', error: 'TimeoutError: locator.click: Timeout 30000ms exceeded.' },
      { suite: 'api', title: 'POST /api/users creates a user', browser: 'api', error: 'Error: POST user should return 201 — Expected: 201, Received: 500' },
    ]
    : [];
  return {
    runId: makeRunId(key, end, 0).replace(/-00000$/, '-TEST'),
    runNumber: 0,
    status,
    errorMessage: status === 'error' ? 'No results were produced for: api. (sample)' : '',
    project: {
      key, displayName: config.displayName || project.projectName, application: project.projectName,
      environment: project.environment, applicationUrl: project.applicationUrl,
    },
    totals,
    suites: [
      { name: 'smoke', status: 'passed', total: 12, passed: 12, failed: 0, flaky: 0, skipped: 0, durationMs: 95000 },
      { name: 'regression', status: status === 'failed' ? 'failed' : status === 'partial' ? 'partial' : 'passed', total: 138, passed: totals.passed - 54, failed: Math.min(totals.failed, 4), flaky: totals.flaky, skipped: totals.skipped, durationMs: 960000 },
      ...(status === 'error' ? [] : [{ name: 'api', status: status === 'failed' ? 'failed' : 'passed', total: 42, passed: 42 - (status === 'failed' ? 1 : 0), failed: status === 'failed' ? 1 : 0, flaky: 0, skipped: 0, durationMs: 88000 }]),
    ],
    browsers: ['chrome', 'edge', 'api'],
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationMs: end - start,
    failures,
    failureCount: totals.failed,
    reportUrl: config.reportUrl || project.email?.reportUrl || '',
    ciUrl: '',
    localReport: 'reports/all-suites/dashboard.html',
    host: require('os').hostname(),
  };
}

(async () => {
  if (fs.existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile(path.join(ROOT, '.env.local'));
  const project = loadProject();
  const teams = teamsSettings(project);
  const status = arg('status') ?? 'failed';
  const key = arg('project') ?? teams.project ?? 'default';
  const dryRun = process.argv.includes('--dry-run');

  if (!['passed', 'failed', 'partial', 'error'].includes(status)) {
    console.error('--status must be passed, failed, partial or error');
    process.exit(1);
  }
  const config = teams.projects[key];
  if (!config) {
    console.error(`[Teams] No Teams project "${key}" in project.json (teams.projects). Known: ${Object.keys(teams.projects).join(', ') || '(none)'}`);
    process.exit(1);
  }
  if (!teams.enabled && !dryRun) {
    log('Teams reporting is disabled (TEAMS_ENABLED or teams.enabled); nothing sent. Use --dry-run to build the card anyway.');
    process.exit(0);
  }

  const result = sampleResult(status, key, config, project);
  const payload = buildPayload(result);
  log(`Sample ${status.toUpperCase()} card for ${config.displayName || key} (Run ID ${result.runId})`);

  if (dryRun) {
    const file = path.join(ROOT, 'reports', 'teams', `${result.runId}-${status}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    log(`Dry run: card saved to ${path.relative(ROOT, file)} (${Buffer.byteLength(JSON.stringify(payload))} bytes, not sent).`);
    log('Preview: paste the "content" object into https://adaptivecards.microsoft.com/designer');
    return;
  }

  const webhookUrl = process.env[config.webhookUrlEnv];
  if (!webhookUrl) {
    console.error(`[Teams] ${config.webhookUrlEnv} is not set. Add it to .env.local (see docs/14-teams-reporting.md).`);
    process.exit(1);
  }
  log('Sending sample...');
  const sent = await postToWebhook(webhookUrl, payload, { attempts: teams.retries ?? 3, timeoutMs: teams.timeoutMs ?? 15000, log });
  if (sent.ok) {
    log(`Sent (HTTP ${sent.status}). The card appears in the channel within a few seconds.`);
    log('If it never appears: open the workflow in the Workflows app and check its run history.');
  } else {
    log('Failed to send notification');
    if (sent.status) log(`HTTP Status: ${sent.status}`);
    log(`Reason: ${sent.error}`);
    process.exit(1);
  }
})();
