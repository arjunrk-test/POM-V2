// Emails a suite's results to the people listed in project.json.
// Called automatically by run-suite.js after a suite run; can also be run on its own
// to (re)send the last results of a suite:
//   node scripts/send-report.js smoke
//   node scripts/send-report.js smoke --dry-run   (build the email, don't send it)
//
// The email body is also saved to reports/<suite>/email.html so you can preview it.
// SMTP login comes from SMTP_USER / SMTP_PASS (environment variables or .env.local).

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { renderCharts } = require('./report-charts');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_FILE = path.join(ROOT, 'project.json');

function loadProject() {
  const project = JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf-8'));
  const email = project.email ?? {};
  if (email.enabled && !(email.to ?? []).length) {
    throw new Error(`${PROJECT_FILE}: "email.to" needs at least one address`);
  }
  if (!['always', 'failure'].includes(email.sendOn ?? 'always')) {
    throw new Error(`${PROJECT_FILE}: "email.sendOn" must be "always" or "failure"`);
  }
  return project;
}

/** Reads reports/<suite>/results.json (Playwright JSON reporter) into a summary. */
function summarize(resultsFile) {
  const report = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
  const tests = [];
  const collect = (node, titlePath) => {
    for (const spec of node.specs ?? []) {
      for (const test of spec.tests) {
        const error = test.results.at(-1)?.error?.message ?? '';
        tests.push({
          title: [...titlePath, spec.title].join(' › '),
          file: spec.file,
          browser: test.projectName,
          status: test.status, // expected | unexpected | flaky | skipped
          durationMs: test.results.at(-1)?.duration ?? 0,
          error: error.replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0],
        });
      }
    }
    for (const child of node.suites ?? []) {
      collect(child, child.type === 'describe' ? [...titlePath, child.title] : titlePath);
    }
  };
  for (const fileSuite of report.suites ?? []) collect(fileSuite, []);

  const count = (status, browser) =>
    tests.filter((t) => t.status === status && (!browser || t.browser === browser)).length;
  const browsers = [...new Set(tests.map((t) => t.browser))].map((name) => ({
    name,
    total: tests.filter((t) => t.browser === name).length,
    passed: count('expected', name),
    failed: count('unexpected', name),
    flaky: count('flaky', name),
    skipped: count('skipped', name),
  }));

  // API tests, grouped by their method folder (tests/api/<get|post|...|flows>/).
  const apiTests = tests.filter((t) => t.browser === 'api');
  const groupOf = (t) => t.file.replace(/\\/g, '/').split('/')[1] ?? 'other';
  const order = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'flows'];
  const api = [...new Set(apiTests.map(groupOf))]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map((group) => {
      const list = apiTests.filter((t) => groupOf(t) === group);
      const n = (status) => list.filter((t) => t.status === status).length;
      return {
        name: group === 'flows' ? 'Flows' : group.toUpperCase(),
        total: list.length, passed: n('expected'), failed: n('unexpected'), flaky: n('flaky'), skipped: n('skipped'),
      };
    });

  return {
    startTime: new Date(report.stats.startTime),
    durationMs: report.stats.duration,
    total: tests.length,
    passed: count('expected'),
    failed: count('unexpected'),
    flaky: count('flaky'),
    skipped: count('skipped'),
    browsers,
    api,
    tests,
    failures: tests.filter((t) => t.status === 'unexpected'),
  };
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * @param {{ cid: string, alt: string, width: number }[]} charts
 * @param {(chart: { cid: string }) => string} chartSrc image URL for a chart (cid: in the email, a file in the preview)
 */
function buildHtml(project, suiteName, summary, notes, charts, chartSrc) {
  const passed = summary.failed === 0;
  const cell = 'style="padding:6px 12px;border:1px solid #ddd;"';
  const head = 'style="padding:6px 12px;border:1px solid #ddd;background:#f4f4f4;text-align:left;"';
  const row = (label, value) => `<tr><th ${head}>${escapeHtml(label)}</th><td ${cell}>${escapeHtml(value)}</td></tr>`;

  const countRows = (rows) => rows
    .map((b) => `<tr><td ${cell}>${escapeHtml(b.name)}</td><td ${cell}>${b.total}</td><td ${cell}>${b.passed}</td>` +
      `<td ${cell}>${b.failed}</td><td ${cell}>${b.flaky}</td><td ${cell}>${b.skipped}</td></tr>`)
    .join('');
  const countHead = (label) => `<tr><th ${head}>${label}</th><th ${head}>Total</th><th ${head}>Passed</th><th ${head}>Failed</th><th ${head}>Flaky</th><th ${head}>Skipped</th></tr>`;
  const hasApi = summary.api.length > 0;

  const failureRows = summary.failures
    .map((f) => `<tr><td ${cell}>${escapeHtml(f.title)}<br><small style="color:#666;">${escapeHtml(f.file)}</small></td>` +
      `<td ${cell}>${escapeHtml(f.browser)}</td><td ${cell}><code>${escapeHtml(f.error)}</code></td></tr>`)
    .join('');

  return `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222;">
<h2 style="margin:0 0 4px;">${escapeHtml(project.projectName)}: ${escapeHtml(suiteName)} suite</h2>
<p style="margin:0 0 16px;font-size:16px;font-weight:bold;color:${passed ? '#1a7f37' : '#cf222e'};">
  ${passed ? 'PASSED' : 'FAILED'}: ${summary.passed} of ${summary.total} passed${summary.failed ? `, ${summary.failed} failed` : ''}${summary.flaky ? `, ${summary.flaky} flaky` : ''}
</p>

<table style="border-collapse:collapse;margin-bottom:16px;">
  ${row('Environment', project.environment ?? '-')}
  ${row('Application', project.applicationUrl ?? '-')}
  ${row('Started', summary.startTime.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}
  ${row('Duration', formatDuration(summary.durationMs))}
</table>

${charts.map((c) => `<p style="margin:0 0 20px;"><img src="${chartSrc(c)}" width="${c.width}" alt="${escapeHtml(c.alt)}" style="display:block;max-width:100%;height:auto;border:0;"></p>`).join('')}

<h3 style="margin:16px 0 8px;">${hasApi ? 'By browser / API' : 'By browser'}</h3>
<table style="border-collapse:collapse;">
  ${countHead(hasApi ? 'Project' : 'Browser')}
  ${countRows(summary.browsers)}
</table>

${hasApi ? `<h3 style="margin:16px 0 8px;">API tests by method</h3>
<table style="border-collapse:collapse;">
  ${countHead('Method')}
  ${countRows(summary.api)}
</table>` : ''}

${summary.failures.length ? `<h3 style="margin:16px 0 8px;">Failed tests</h3>
<table style="border-collapse:collapse;">
  <tr><th ${head}>Test</th><th ${head}>${hasApi ? 'Project' : 'Browser'}</th><th ${head}>Error</th></tr>
  ${failureRows}
</table>` : ''}

${project.email.reportUrl ? `<p style="margin-top:16px;">Full report: <a href="${escapeHtml(project.email.reportUrl)}">${escapeHtml(project.email.reportUrl)}</a></p>` : ''}
${notes.map((n) => `<p style="color:#666;">${escapeHtml(n)}</p>`).join('')}
<p style="color:#999;font-size:12px;margin-top:24px;">Sent automatically by the ${escapeHtml(project.team ?? 'test automation')} framework.</p>
</body></html>`;
}

/** Picks the report files to attach, skipping any over the size limit. */
function collectAttachments(project, reportDir, suiteName, notes) {
  if (!project.email.attachReports) return [];
  const limit = (project.email.maxAttachmentMB ?? 10) * 1024 * 1024;
  const candidates = [
    { filename: `${suiteName}-dashboard.html`, path: path.join(reportDir, 'dashboard.html') },
    { filename: `${suiteName}-playwright-report.html`, path: path.join(reportDir, 'html', 'index.html') },
    { filename: `${suiteName}-results.xml`, path: path.join(reportDir, 'results.xml') },
  ];
  const attachments = [];
  for (const file of candidates) {
    if (!fs.existsSync(file.path)) continue;
    if (fs.statSync(file.path).size > limit) {
      notes.push(`${file.filename} was not attached because it is larger than ${project.email.maxAttachmentMB ?? 10} MB.`);
      continue;
    }
    attachments.push(file);
  }
  if (attachments.some((a) => a.filename.endsWith('-dashboard.html'))) {
    notes.push(`Open the attached ${suiteName}-dashboard.html in a browser for charts, the execution timeline, and every test's steps, errors and screenshots. Traces stay in reports/ on the machine that ran the suite.`);
  } else if (attachments.some((a) => a.filename.endsWith('.html'))) {
    notes.push('Open the attached HTML report in a browser for full details. Traces stay in reports/ on the machine that ran the suite.');
  }
  return attachments;
}

/**
 * @param {string} suiteName
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<boolean>} true if sent (or skipped on purpose), false on error
 */
async function sendReport(suiteName, { dryRun = false } = {}) {
  try {
    const project = loadProject();
    const email = project.email ?? {};
    if (!email.enabled) {
      console.log('Email: disabled in project.json, not sending.');
      return true;
    }

    const reportDir = path.join(ROOT, 'reports', suiteName);
    const resultsFile = path.join(reportDir, 'results.json');
    if (!fs.existsSync(resultsFile)) {
      throw new Error(`No results found at ${resultsFile}. Run the suite first: suite.bat ${suiteName}`);
    }

    const summary = summarize(resultsFile);
    if (email.sendOn === 'failure' && summary.failed === 0) {
      console.log('Email: all tests passed and sendOn is "failure", not sending.');
      return true;
    }

    const notes = [];
    const attachments = collectAttachments(project, reportDir, suiteName, notes);

    /** @type {{ cid: string, file: string, alt: string, width: number }[]} */
    let charts = [];
    if (email.charts !== false) {
      try {
        charts = await renderCharts(summary, path.join(reportDir, 'charts'));
      } catch (error) {
        // Charts are a nice-to-have; the email still goes out with the tables.
        console.error(`Email: charts could not be drawn, sending without them. ${String(error.message).split('\n')[0]}`);
      }
    }
    const html = buildHtml(project, suiteName, summary, notes, charts, (c) => `cid:${c.cid}`);
    const status = summary.failed === 0 ? 'PASSED' : 'FAILED';
    const subject = `${email.subjectPrefix ? `${email.subjectPrefix} ` : ''}${suiteName} suite ${status}: ` +
      `${summary.passed}/${summary.total} passed${summary.failed ? `, ${summary.failed} failed` : ''}`;

    fs.writeFileSync(
      path.join(reportDir, 'email.html'),
      buildHtml(project, suiteName, summary, notes, charts, (c) => `charts/${c.cid}.png`),
    );

    if (dryRun) {
      console.log(`Email (dry run, not sent): "${subject}"`);
      console.log(`  to: ${email.to.join(', ')}`);
      console.log(`  attachments: ${attachments.map((a) => a.filename).join(', ') || '(none)'}`);
      console.log(`  preview: reports/${suiteName}/email.html`);
      return true;
    }

    if (fs.existsSync(path.join(ROOT, '.env.local'))) process.loadEnvFile(path.join(ROOT, '.env.local'));
    const { SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_USER || !SMTP_PASS) {
      throw new Error('SMTP_USER and SMTP_PASS are not set. Fill them in in .env.local.');
    }

    const transport = nodemailer.createTransport({
      host: email.smtp.host,
      port: email.smtp.port,
      secure: email.smtp.secure,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({
      from: email.from ?? SMTP_USER,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject,
      html,
      attachments: [
        ...attachments,
        // Inline images, shown in the body via <img src="cid:...">.
        ...charts.map((c) => ({ filename: `${c.cid}.png`, path: c.file, cid: c.cid, contentDisposition: 'inline' })),
      ],
    });
    console.log(`Email: sent "${subject}" to ${[...email.to, ...(email.cc ?? [])].join(', ')}`);
    return true;
  } catch (error) {
    console.error(`Email: NOT sent. ${error.message}`);
    return false;
  }
}

module.exports = { sendReport };

if (require.main === module) {
  const [suiteName, ...flags] = process.argv.slice(2);
  if (!suiteName) {
    console.error('Usage: node scripts/send-report.js <suite-name> [--dry-run]');
    process.exit(1);
  }
  sendReport(suiteName, { dryRun: flags.includes('--dry-run') }).then((ok) => process.exit(ok ? 0 : 1));
}
