// Builds the RunResult that notifications (Teams, and the run history) report on.
//
// It does NOT recalculate anything: the numbers come from combineSummaries() in
// send-report.js, the same code the email uses, so email and Teams always agree.

const os = require('os');
const { combineSummaries } = require('../send-report');

/** How many failed tests a notification lists (the rest are in the reports). */
const MAX_FAILURES_LISTED = 5;

/**
 * PASSED  every test passed (flaky tests passed on retry and count as passed)
 * FAILED  at least one test failed
 * PARTIAL nothing failed, but some tests were skipped
 * ERROR   the run itself broke: a suite produced no results, no tests ran, or
 *         Playwright exited with an error although no test failed (e.g. the demo API
 *         server didn't start, a global setup error, an interrupted run)
 * @returns {'passed' | 'failed' | 'partial' | 'error'}
 */
function deriveStatus({ total, failed, skipped, missing, exitCodes, error }) {
  if (error) return 'error';
  if (missing.length > 0 || total === 0) return 'error';
  if (failed > 0) return 'failed';
  if (exitCodes.some((code) => code !== 0)) return 'error';
  if (skipped > 0) return 'partial';
  return 'passed';
}

/** A link people can open: a configured report URL, or the CI run page. Never a local file path. */
function ciRunUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, BUILD_URL } = process.env;
  if (GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID) return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
  if (BUILD_URL) return BUILD_URL; // Jenkins
  return '';
}

/**
 * @param {{
 *   suiteNames: string[],
 *   exitCodes?: Record<string, number>,   suite name -> Playwright exit code
 *   project: any,                          project.json
 *   teamsProject?: { key: string, displayName?: string, reportUrl?: string },
 *   runId: string, runNumber: number,
 *   error?: string                         set when the run couldn't start (e.g. a broken suite file)
 * }} input
 */
function buildRunResult({ suiteNames, exitCodes = {}, project, teamsProject, runId, runNumber, error }) {
  const { suites, missing, combined } = combineSummaries(error ? [] : suiteNames);
  const now = new Date();
  const start = suites.length ? Math.min(...suites.map((s) => s.summary.startTime.getTime())) : now.getTime();
  const end = suites.length ? Math.max(...suites.map((s) => s.summary.startTime.getTime() + s.summary.durationMs)) : now.getTime();
  const browsers = [...new Set(suites.flatMap((s) => s.summary.browsers.map((b) => b.name)))];

  const status = deriveStatus({
    total: combined.total,
    failed: combined.failed,
    skipped: combined.skipped,
    missing: error ? [] : missing,
    exitCodes: suiteNames.map((name) => exitCodes[name] ?? 0),
    error,
  });

  let errorMessage = error ?? '';
  if (!errorMessage && status === 'error') {
    if (missing.length) errorMessage = `No results were produced for: ${missing.join(', ')}.`;
    else if (combined.total === 0) errorMessage = 'No tests ran.';
    else errorMessage = 'Playwright reported an error although no test failed (see the console output of the run).';
  }

  return {
    runId,
    runNumber,
    status,
    errorMessage,
    project: {
      key: teamsProject?.key ?? '',
      displayName: teamsProject?.displayName || project.projectName || 'Automation',
      application: project.projectName ?? '',
      environment: project.environment ?? '',
      applicationUrl: project.applicationUrl ?? '',
    },
    totals: { total: combined.total, passed: combined.passed, failed: combined.failed, flaky: combined.flaky, skipped: combined.skipped },
    suites: suites.map(({ name, summary: s }) => ({
      name,
      status: s.failed > 0 ? 'failed' : (exitCodes[name] ?? 0) !== 0 ? 'error' : s.skipped > 0 ? 'partial' : 'passed',
      total: s.total, passed: s.passed, failed: s.failed, flaky: s.flaky, skipped: s.skipped, durationMs: s.durationMs,
    })),
    missingSuites: error ? [] : missing,
    browsers,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    durationMs: Math.max(0, end - start),
    failures: combined.failures.slice(0, MAX_FAILURES_LISTED).map((f) => ({
      suite: f.suite, title: f.title, browser: f.browser, error: f.error,
    })),
    failureCount: combined.failures.length,
    reportUrl: teamsProject?.reportUrl || project.email?.reportUrl || '',
    ciUrl: ciRunUrl(),
    localReport: suiteNames.length > 1 ? 'reports/all-suites/dashboard.html' : `reports/${suiteNames[0]}/dashboard.html`,
    host: os.hostname(),
  };
}

module.exports = { buildRunResult };
