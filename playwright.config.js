// @ts-check
import { defineConfig } from '@playwright/test';
import path from 'path';
import { browserProjects, loadSuite } from './utilities/browserPlan';
import { API_BASE_URL, ENDPOINTS, USES_LOCAL_API } from './utilities/globalApi';

const testDir = path.resolve(__dirname, 'tests');

/* Suite to run (see test-plans/suites/). suite.bat sets this; without it every test runs. */
const suiteName = process.env.SUITE;
const suite = suiteName ? loadSuite(__dirname, testDir, suiteName) : undefined;
const suiteReports = `reports/${suiteName}`;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only, unless the suite says otherwise */
  retries: suite?.retries ?? (process.env.CI ? 2 : 0),
  /* Opt out of parallel tests on CI, unless the suite says otherwise */
  workers: suite?.workers ?? (process.env.CI ? 1 : undefined),
  /* Reporter to use. See https://playwright.dev/docs/test-reporters
   * Suite runs write an HTML report, JUnit XML (like testng-results.xml), JSON
   * (read by the report email) and the dashboard to reports/<suite>/.
   * Plain runs write the HTML report to playwright-report/ and the dashboard to reports/local/. */
  reporter: suite
    ? [
        ['list'],
        ['html', { outputFolder: `${suiteReports}/html`, open: 'never' }],
        ['junit', { outputFile: `${suiteReports}/results.xml`, suiteName: suite.name }],
        ['json', { outputFile: `${suiteReports}/results.json` }],
        ['./reporters/dashboard-reporter.js', { outputFile: `${suiteReports}/dashboard.html`, htmlReport: 'html/index.html', suiteName: suite.name }],
      ]
    : [
        ['html'],
        ['./reporters/dashboard-reporter.js', { outputFile: 'reports/local/dashboard.html', htmlReport: '../../playwright-report/index.html' }],
      ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* One project per browser (chrome, edge), plus "api" for the API tests in tests/api/.
   * Which UI tests run in which browser comes from test-plans/browsers.json,
   * narrowed to the suite's tests when SUITE is set. */
  projects: browserProjects(__dirname, testDir, suite),

  /* Start the demo API (api-server/) for the API tests, unless API_BASE_URL points elsewhere.
   * If it's already running (npm run api:start), the running one is reused. */
  webServer: USES_LOCAL_API
    ? {
        command: 'node api-server/server.js',
        url: `${API_BASE_URL}${ENDPOINTS.health}`,
        reuseExistingServer: true,
        timeout: 30_000,
      }
    : undefined,
});

