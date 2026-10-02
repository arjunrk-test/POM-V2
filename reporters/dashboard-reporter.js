// Custom Playwright reporter that writes a single, self-contained HTML dashboard:
// summary tiles, charts, an execution timeline, failures, and a searchable table of
// every test with its steps, errors, attachments and logs.
//
// The page works offline (no CDN), so it can be opened from disk or attached to an email.
// Each test links to the built-in Playwright HTML report for traces.
//
// Options (set in playwright.config.js):
//   outputFile  where to write the dashboard, relative to the config folder
//   htmlReport  path of the Playwright HTML report's index.html, relative to the dashboard
//   suiteName   display name of the suite (omit for plain runs)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const TEMPLATE = path.join(__dirname, 'dashboard-template.html');
const MAX_EMBEDDED_IMAGE = 2 * 1024 * 1024; // screenshots bigger than this are not embedded
const MAX_LOG = 20000; // characters of stdout / stderr / text attachments kept per attempt
const STEP_CATEGORIES = new Set(['hook', 'test.step', 'pw:api', 'expect']);

const stripAnsi = (text) => String(text ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const toPosix = (file) => file.replace(/\\/g, '/');

function git(command) {
  try {
    return execSync(`git ${command}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function readProject(configDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(configDir, 'project.json'), 'utf-8'));
  } catch {
    return {};
  }
}

const outcomeToStatus = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'skipped' };

class DashboardReporter {
  constructor(options = {}) {
    this.options = options;
  }

  printsToStdio() {
    return false;
  }

  onBegin(config, rootSuite) {
    this.config = config;
    this.rootSuite = rootSuite;
  }

  async onEnd(result) {
    const configDir = this.config.configFile ? path.dirname(this.config.configFile) : this.config.rootDir;
    const outputFile = path.resolve(configDir, this.options.outputFile ?? 'reports/dashboard.html');
    const data = this.collect(result, configDir);

    const template = fs.readFileSync(TEMPLATE, 'utf-8');
    // Escape "<" so test output can never close the <script> tag early.
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const html = template.replace('/*__DASHBOARD_DATA__*/null', () => json);

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, html);
    // The raw data too, so several suites' dashboards can be merged into one
    // (scripts/combine-dashboards.js).
    fs.writeFileSync(outputFile.replace(/\.html$/, '-data.json'), JSON.stringify(data));
  }

  collect(result, configDir) {
    const project = readProject(configDir);
    const tests = this.rootSuite.allTests().map((test) => this.describeTest(test));
    const projects = this.config.projects;

    return {
      project: {
        name: project.projectName ?? 'Test run',
        team: project.team ?? '',
        environment: project.environment ?? '',
        applicationUrl: project.applicationUrl ?? '',
      },
      run: {
        suite: this.options.suiteName ?? '',
        status: result.status, // passed | failed | timedout | interrupted
        startTime: result.startTime.getTime(),
        duration: result.duration,
        generatedAt: Date.now(),
        htmlReport: this.options.htmlReport ?? '',
      },
      environment: {
        playwright: this.config.version,
        node: process.version,
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        host: os.hostname(),
        ci: !!process.env.CI,
        workers: this.config.workers,
        retries: projects[0]?.retries ?? 0,
        timeout: projects[0]?.timeout ?? 0,
        browsers: projects.map((p) => p.name),
        branch: git('rev-parse --abbrev-ref HEAD'),
        commit: git('rev-parse --short HEAD'),
        commitMessage: git('log -1 --pretty=%s'),
      },
      tests,
    };
  }

  describeTest(test) {
    const project = test.parent.project();
    const testDir = project?.testDir ?? this.config.rootDir;
    // titlePath: ['', project, file, ...describe blocks, title]
    const groups = test.titlePath().slice(3, -1);

    return {
      id: test.id,
      title: test.title,
      groups,
      file: toPosix(path.relative(testDir, test.location.file)),
      line: test.location.line,
      browser: project?.name ?? '',
      tags: test.tags,
      status: outcomeToStatus[test.outcome()] ?? 'failed',
      duration: test.results.reduce((sum, r) => sum + r.duration, 0),
      attempts: test.results.map((r) => this.describeAttempt(r, testDir)),
    };
  }

  describeAttempt(result, testDir) {
    const log = (chunks) => {
      const text = chunks.map((c) => (typeof c === 'string' ? c : c.toString())).join('');
      return text.length > MAX_LOG ? `${text.slice(0, MAX_LOG)}\n… (truncated)` : text;
    };
    return {
      retry: result.retry,
      status: result.status, // passed | failed | timedOut | skipped | interrupted
      duration: result.duration,
      start: result.startTime.getTime(),
      lane: result.parallelIndex,
      errors: result.errors.map((e) => ({
        message: stripAnsi(e.message ?? e.value ?? ''),
        snippet: stripAnsi(e.snippet ?? ''),
        location: e.location ? `${toPosix(path.relative(testDir, e.location.file))}:${e.location.line}` : '',
      })),
      steps: this.describeSteps(result.steps, 0),
      attachments: result.attachments.map((a) => this.describeAttachment(a)).filter(Boolean),
      stdout: log(result.stdout),
      stderr: log(result.stderr),
    };
  }

  describeSteps(steps, depth) {
    return steps
      .filter((s) => STEP_CATEGORIES.has(s.category))
      .map((s) => ({
        title: s.title,
        category: s.category,
        duration: s.duration,
        failed: !!s.error,
        steps: depth < 2 ? this.describeSteps(s.steps, depth + 1) : [],
      }));
  }

  describeAttachment(attachment) {
    const { name, contentType } = attachment;
    if (name === 'trace' || contentType === 'application/zip') return { name, contentType, kind: 'trace' };
    if (contentType.startsWith('image/')) {
      try {
        const buffer = attachment.body ?? fs.readFileSync(attachment.path);
        if (buffer.length <= MAX_EMBEDDED_IMAGE) {
          return { name, contentType, kind: 'image', src: `data:${contentType};base64,${buffer.toString('base64')}` };
        }
      } catch {
        // fall through: listed by name only
      }
    }
    if (contentType.startsWith('text/') || contentType === 'application/json') {
      try {
        const text = (attachment.body ?? fs.readFileSync(attachment.path)).toString('utf-8');
        return { name, contentType, kind: 'text', text: text.length > MAX_LOG ? `${text.slice(0, MAX_LOG)}\n… (truncated)` : text };
      } catch {
        // fall through: listed by name only
      }
    }
    return { name, contentType, kind: 'file' };
  }
}

module.exports = DashboardReporter;
