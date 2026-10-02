// Merges the dashboards of several suites into ONE consolidated dashboard:
//   reports/all-suites/dashboard.html
//
// Used after running several suites with one command (suite.bat --all, or
// suite.bat smoke regression api). It reads each suite's reports/<suite>/dashboard-data.json
// (written by reporters/dashboard-reporter.js) and renders them with the same template,
// adding a "Results by suite" chart, a suite filter and the suite name on every test.
//
// Run on its own:  node scripts/combine-dashboards.js smoke regression api

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');
const TEMPLATE = path.join(ROOT, 'reporters', 'dashboard-template.html');
const OUT_DIR = path.join(REPORTS, 'all-suites');

/**
 * @param {string[]} suiteNames
 * @returns {{ file: string, missing: string[] } | null} null when no suite has data
 */
function buildCombinedDashboard(suiteNames) {
  const parts = [];
  const missing = [];
  for (const name of suiteNames) {
    const file = path.join(REPORTS, name, 'dashboard-data.json');
    if (!fs.existsSync(file)) { missing.push(name); continue; }
    parts.push({ name, data: JSON.parse(fs.readFileSync(file, 'utf-8')) });
  }
  if (!parts.length) return null;

  const start = Math.min(...parts.map((p) => p.data.run.startTime));
  const end = Math.max(...parts.map((p) => p.data.run.startTime + p.data.run.duration));
  const first = parts[0].data;

  const combined = {
    project: first.project,
    run: {
      suite: '',
      status: parts.every((p) => p.data.run.status === 'passed') && !missing.length ? 'passed' : 'failed',
      startTime: start,
      duration: end - start,
      generatedAt: Date.now(),
      htmlReport: '', // each suite has its own Playwright report: links are per test
    },
    environment: {
      ...first.environment,
      workers: [...new Set(parts.map((p) => p.data.environment.workers))].join(' / '),
      retries: [...new Set(parts.map((p) => p.data.environment.retries))].join(' / '),
      browsers: [...new Set(parts.flatMap((p) => p.data.environment.browsers))],
    },
    suites: parts.map((p) => ({
      name: p.name,
      status: p.data.run.status,
      startTime: p.data.run.startTime,
      duration: p.data.run.duration,
    })),
    tests: parts.flatMap((p) => p.data.tests.map((t) => ({
      ...t,
      id: `${p.name}:${t.id}`, // the same test can run in several suites
      reportId: t.id,
      suite: p.name,
      // Relative to reports/all-suites/: each test links into its own suite's Playwright report.
      htmlReport: `../${p.name}/html/index.html`,
    }))),
  };

  const template = fs.readFileSync(TEMPLATE, 'utf-8');
  const json = JSON.stringify(combined).replace(/</g, '\\u003c');
  const html = template.replace('/*__DASHBOARD_DATA__*/null', () => json);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'dashboard.html');
  fs.writeFileSync(file, html);
  return { file, missing };
}

module.exports = { buildCombinedDashboard };

if (require.main === module) {
  const names = process.argv.slice(2);
  if (names.length < 2) {
    console.error('Usage: node scripts/combine-dashboards.js <suite> <suite> [...]');
    process.exit(1);
  }
  const result = buildCombinedDashboard(names);
  if (!result) {
    console.error(`No dashboard data found for: ${names.join(', ')}. Run the suites first.`);
    process.exit(1);
  }
  console.log(`Consolidated dashboard: ${path.relative(ROOT, result.file)}`);
  if (result.missing.length) console.log(`  (no data for: ${result.missing.join(', ')})`);
}
