// Runs test suites from test-plans/suites/<name>.json — the Playwright version of
// running testng.xml. Usage:
//   suite.bat smoke                    one suite (or: npm run suite -- smoke)
//   suite.bat smoke regression api     several suites, one after another
//   suite.bat --all                    every suite in test-plans/suites/
//   suite.bat smoke --headed           extra arguments are passed to Playwright
//   suite.bat smoke --no-email         don't send the report email
//   suite.bat smoke --email-dry-run    build the email but don't send it
//
// Before running anything, it checks that every test and file listed in each suite
// matches a real test, so a typo fails loudly instead of a test silently not running.
// Each suite writes its reports to reports/<name>/. One suite sends its own email;
// several suites send ONE combined email at the end.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUITES_DIR = path.join(ROOT, 'test-plans', 'suites');
const PLAYWRIGHT_CLI = require.resolve('@playwright/test/cli');
const { sendReport, sendCombinedReport } = require('./send-report');

const OWN_FLAGS = ['--no-email', '--email-dry-run', '--all'];
const args = process.argv.slice(2);
// Suite names come first; everything from the first option onwards is for Playwright
// (so `-g "log in"` never mistakes "log in" for a suite name).
const firstOption = args.findIndex((a) => a.startsWith('-'));
const named = firstOption === -1 ? args : args.slice(0, firstOption);
const options = firstOption === -1 ? [] : args.slice(firstOption);
const playwrightArgs = options.filter((a) => !OWN_FLAGS.includes(a));
const available = fs.existsSync(SUITES_DIR)
  ? fs.readdirSync(SUITES_DIR).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json')).sort()
  : [];
const suiteNames = options.includes('--all') ? available : [...new Set(named)];

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: suite.bat <suite> [<suite> ...] [--no-email] [--email-dry-run] [playwright options]');
  console.error('       suite.bat --all [--no-email] [--email-dry-run] [playwright options]');
  console.error(`Available suites: ${available.join(', ') || '(none)'}`);
  process.exit(1);
}

if (suiteNames.length === 0) usage();
const unknown = suiteNames.filter((name) => !available.includes(name));
if (unknown.length) usage(`Suite(s) not found in ${SUITES_DIR}: ${unknown.join(', ')}`);

/** @param {string} suiteName @param {string[]} pwArgs */
const playwright = (suiteName, pwArgs, spawnOptions = {}) =>
  spawnSync(process.execPath, [PLAYWRIGHT_CLI, 'test', ...pwArgs], { cwd: ROOT, env: { ...process.env, SUITE: suiteName }, ...spawnOptions });

const normalize = (/** @type {string} */ file) => file.replace(/\\/g, '/');

/**
 * Lists what a suite would run and checks every suite entry matched something.
 * @returns {{ ok: true, found: { project: string, file: string, title: string }[] } | { ok: false, message: string }}
 */
function check(suiteName) {
  const suite = JSON.parse(fs.readFileSync(path.join(SUITES_DIR, `${suiteName}.json`), 'utf-8'));
  const listing = playwright(suiteName, ['--list', '--reporter=json'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (listing.status !== 0) return { ok: false, message: listing.stderr || listing.stdout };

  /** @type {{ project: string, file: string, title: string }[]} */
  const found = [];
  const collect = (node, titlePath) => {
    for (const spec of node.specs ?? []) {
      const title = [...titlePath, spec.title].join(' ');
      for (const test of spec.tests) found.push({ project: test.projectName, file: spec.file, title });
    }
    for (const child of node.suites ?? []) collect(child, child.type === 'describe' ? [...titlePath, child.title] : titlePath);
  };
  for (const fileSuite of JSON.parse(listing.stdout).suites ?? []) collect(fileSuite, []);

  const missing = [
    ...(suite.tests ?? [])
      .filter((t) => !found.some((f) => f.title === t || f.title.endsWith(` ${t}`)))
      .map((t) => `test "${t}"`),
    ...(suite.files ?? [])
      .filter((file) => !found.some((f) => normalize(f.file) === normalize(file) || normalize(f.file).startsWith(`${normalize(file).replace(/\/+$/, '')}/`)))
      .map((file) => `file "${file}"`),
  ];
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Suite "${suiteName}" lists entries that match no test in any browser:\n${missing.map((m) => `  - ${m}`).join('\n')}\n` +
        'Check the spelling against the test titles, and that test-plans/browsers.json gives them a browser.',
    };
  }
  return { ok: true, found, displayName: suite.name ?? suiteName };
}

// 1. Check every suite before running any of them.
const checked = suiteNames.map((name) => ({ name, ...check(name) }));
const broken = checked.filter((c) => !c.ok);
if (broken.length) {
  for (const b of broken) console.error(b.message.trimEnd());
  process.exit(1);
}

// 2. Run the suites one after another. A failing suite doesn't stop the next one.
/** @type {{ name: string, status: number, durationMs: number }[]} */
const results = [];
for (const [index, { name, found, displayName }] of checked.entries()) {
  if (suiteNames.length > 1) console.log(`\n=== [${index + 1}/${suiteNames.length}] ${displayName} ===`);
  console.log(`Suite: ${displayName}, ${found.length} test run(s)`);
  for (const project of [...new Set(found.map((f) => f.project))]) {
    console.log(`  ${project}: ${found.filter((f) => f.project === project).length}`);
  }
  console.log('');

  const started = Date.now();
  const run = playwright(name, playwrightArgs, { stdio: 'inherit' });
  results.push({ name, status: run.status ?? 1, durationMs: Date.now() - started });

  console.log('');
  console.log(`Dashboard:    reports/${name}/dashboard.html  (double-click to open)`);
  console.log(`HTML report:  reports/${name}/html/index.html  (open with: npx playwright show-report reports/${name}/html)`);
  console.log(`JUnit report: reports/${name}/results.xml`);
}

if (results.length > 1) {
  console.log('\n=== Summary ===');
  for (const r of results) console.log(`  ${r.status === 0 ? 'PASSED' : 'FAILED'}  ${r.name}`);
}

// 3. Email the results: one email per run (combined when several suites ran).
// A failed email is reported but doesn't change the exit code, which reflects the tests.
const exitCode = results.some((r) => r.status !== 0) ? 1 : 0;
(async () => {
  const dryRun = options.includes('--email-dry-run');
  if (options.includes('--no-email')) console.log('Email: skipped (--no-email).');
  else if (results.length === 1) await sendReport(results[0].name, { dryRun });
  else await sendCombinedReport(results.map((r) => r.name), { dryRun });
  process.exit(exitCode);
})();
