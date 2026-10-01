// Runs a test suite from test-plans/suites/<name>.json — the Playwright version of
// running testng.xml. Usage:
//   suite.bat smoke              (or: npm run suite -- smoke)
//   suite.bat smoke --headed     (extra arguments are passed to Playwright)
//   suite.bat smoke --no-email   (don't send the report email)
//   suite.bat smoke --email-dry-run   (build the email but don't send it)
//
// Before running, it checks that every test and file listed in the suite matches
// a real test, so a typo fails loudly instead of the test silently not running.
// Reports go to reports/<name>/html (HTML) and reports/<name>/results.xml (JUnit),
// then the results are emailed to the recipients in project.json.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUITES_DIR = path.join(ROOT, 'test-plans', 'suites');
const PLAYWRIGHT_CLI = require.resolve('@playwright/test/cli');
const { sendReport } = require('./send-report');

const EMAIL_FLAGS = ['--no-email', '--email-dry-run'];
const [suiteName, ...args] = process.argv.slice(2);
const playwrightArgs = args.filter((arg) => !EMAIL_FLAGS.includes(arg));
const available = fs.existsSync(SUITES_DIR)
  ? fs.readdirSync(SUITES_DIR).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'))
  : [];

if (!suiteName || suiteName.startsWith('-')) {
  console.error('Usage: suite.bat <suite-name> [--no-email] [--email-dry-run] [playwright options]');
  console.error(`Available suites: ${available.join(', ') || '(none)'}`);
  process.exit(1);
}
if (!available.includes(suiteName)) {
  console.error(`Suite "${suiteName}" not found in ${SUITES_DIR}`);
  console.error(`Available suites: ${available.join(', ') || '(none)'}`);
  process.exit(1);
}

const env = { ...process.env, SUITE: suiteName };
const suite = JSON.parse(fs.readFileSync(path.join(SUITES_DIR, `${suiteName}.json`), 'utf-8'));

/** @param {string[]} args */
const playwright = (args, options = {}) =>
  spawnSync(process.execPath, [PLAYWRIGHT_CLI, 'test', ...args], { cwd: ROOT, env, ...options });

// 1. List what the suite would run, and check every suite entry matched something.
const listing = playwright(['--list', '--reporter=json'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
if (listing.status !== 0) {
  process.stderr.write(listing.stderr || listing.stdout);
  process.exit(listing.status ?? 1);
}

/** @type {{ project: string, file: string, title: string }[]} */
const found = [];
/** @param {any} node @param {string[]} titlePath */
const collect = (node, titlePath) => {
  for (const spec of node.specs ?? []) {
    const title = [...titlePath, spec.title].join(' ');
    for (const test of spec.tests) found.push({ project: test.projectName, file: spec.file, title });
  }
  for (const child of node.suites ?? []) collect(child, child.type === 'describe' ? [...titlePath, child.title] : titlePath);
};
for (const fileSuite of JSON.parse(listing.stdout).suites ?? []) collect(fileSuite, []);

const normalize = (/** @type {string} */ file) => file.replace(/\\/g, '/');
const missing = [
  ...(suite.tests ?? [])
    .filter((t) => !found.some((f) => f.title === t || f.title.endsWith(` ${t}`)))
    .map((t) => `test "${t}"`),
  ...(suite.files ?? [])
    .filter((file) => !found.some((f) => normalize(f.file) === normalize(file)))
    .map((file) => `file "${file}"`),
];
if (missing.length > 0) {
  console.error(`Suite "${suiteName}" lists entries that match no test in any browser:`);
  for (const entry of missing) console.error(`  - ${entry}`);
  console.error('Check the spelling against the test titles, and that test-plans/browsers.json gives them a browser.');
  process.exit(1);
}

console.log(`Suite: ${suite.name ?? suiteName}, ${found.length} test run(s)`);
for (const project of [...new Set(found.map((f) => f.project))]) {
  console.log(`  ${project}: ${found.filter((f) => f.project === project).length}`);
}
console.log('');

// 2. Run the suite.
const run = playwright(playwrightArgs, { stdio: 'inherit' });

console.log('');
console.log(`HTML report:  reports/${suiteName}/html/index.html  (open with: npx playwright show-report reports/${suiteName}/html)`);
console.log(`JUnit report: reports/${suiteName}/results.xml`);

// 3. Email the results. A failed email is reported but doesn't change the exit code,
// which always reflects the test results.
(async () => {
  if (args.includes('--no-email')) console.log('Email: skipped (--no-email).');
  else await sendReport(suiteName, { dryRun: args.includes('--email-dry-run') });
  process.exit(run.status ?? 1);
})();
