// @ts-check

// Decides which tests run in which browser, and which tests belong to a suite.
//
// test-plans/browsers.json — which browser(s) each test runs in:
//   {
//     "defaultBrowsers": ["chrome"],            // browsers for tests NOT listed below ([] = don't run them)
//     "tests": {
//       "user can log in with valid credentials": ["chrome", "edge"]
//     }
//   }
//
// test-plans/suites/<name>.json — which tests a suite runs (like testng.xml):
//   {
//     "name": "Smoke",
//     "workers": 2,                             // optional, tests run in parallel (like thread-count)
//     "retries": 0,                             // optional
//     "files": ["login.spec.js", "api"],        // every test in these files or folders (relative to tests/)
//     "tests": ["user can log in with valid credentials"]   // individual tests by title
//   }
//
// A suite is picked with the SUITE environment variable (suite.bat sets it).
// Without SUITE every test runs. Browsers always come from browsers.json.
//
// API tests (tests/api/) don't use a browser: they run in a separate "api" project.

import fs from 'fs';
import path from 'path';
import { devices } from '@playwright/test';

/** Every browser the plan may refer to, keyed by the name used in browsers.json. */
const BROWSERS = {
  chrome: { ...devices['Desktop Chrome'], channel: 'chrome' },
  edge: { ...devices['Desktop Edge'], channel: 'msedge' },
};

const BROWSERS_FILE = 'test-plans/browsers.json';
const SUITES_DIR = 'test-plans/suites';

/**
 * @typedef {{ defaultBrowsers: string[], tests: Record<string, string[]> }} BrowserPlan
 * @typedef {{ name: string, workers?: number, retries?: number, files: string[], tests: string[] }} Suite
 */

/** @param {string} text */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Playwright greps against "<project> <file> <describe titles...> <test title> <@tags...>".
/** @param {string} title */
const titlePattern = (title) => `${escapeRegExp(title)}( @\\S+)*$`;
/**
 * Matches every test in a spec file, or (folder = true) every test under a folder.
 * @param {string} project @param {string} file @param {boolean} [folder]
 */
const filePattern = (project, file, folder = false) =>
  `^${escapeRegExp(project)} ${file.replace(/[\\/]+$/, '').split(/[\\/]/).map(escapeRegExp).join('[\\\\/]')}${folder ? '[\\\\/]' : ' '}`;

/** API tests live here (relative to the tests folder) and run in the "api" project, not in a browser. */
const API_TEST_DIR = 'api';

/** @param {string} file */
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    throw new Error(`Could not read ${file}: ${/** @type {Error} */ (error).message}`);
  }
};

/**
 * @param {string} rootDir
 * @returns {BrowserPlan}
 */
function loadBrowserPlan(rootDir) {
  const planPath = path.resolve(rootDir, BROWSERS_FILE);
  const plan = readJson(planPath);
  const defaultBrowsers = plan.defaultBrowsers ?? [];
  const tests = plan.tests ?? {};

  // Fail fast on typos like "chorme" rather than silently not running a test.
  const known = Object.keys(BROWSERS);
  const check = (/** @type {string} */ where, /** @type {unknown} */ browsers) => {
    if (!Array.isArray(browsers) || browsers.length === 0) {
      throw new Error(`${planPath}: ${where} must be a non-empty array of browsers (${known.join(', ')})`);
    }
    for (const browser of browsers) {
      if (!known.includes(browser)) {
        throw new Error(`${planPath}: unknown browser "${browser}" in ${where}. Use one of: ${known.join(', ')}`);
      }
    }
  };
  if (defaultBrowsers.length > 0) check('"defaultBrowsers"', defaultBrowsers);
  for (const [title, browsers] of Object.entries(tests)) check(`test "${title}"`, browsers);

  return { defaultBrowsers, tests };
}

/** @param {string} rootDir */
function listSuites(rootDir) {
  const dir = path.resolve(rootDir, SUITES_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'));
}

/**
 * @param {string} rootDir
 * @param {string} testDir
 * @param {string} name suite file name without .json
 * @returns {Suite}
 */
export function loadSuite(rootDir, testDir, name) {
  const suitePath = path.resolve(rootDir, SUITES_DIR, `${name}.json`);
  if (!fs.existsSync(suitePath)) {
    throw new Error(`Suite "${name}" not found at ${suitePath}. Available suites: ${listSuites(rootDir).join(', ') || '(none)'}`);
  }

  const suite = readJson(suitePath);
  const files = suite.files ?? [];
  const tests = suite.tests ?? [];
  if (files.length === 0 && tests.length === 0) {
    throw new Error(`${suitePath}: a suite needs at least one entry in "files" or "tests"`);
  }
  for (const file of files) {
    if (!fs.existsSync(path.resolve(testDir, file))) {
      throw new Error(`${suitePath}: file "${file}" not found in ${testDir} (paths are relative to the tests folder)`);
    }
  }

  return { name: suite.name ?? name, workers: suite.workers, retries: suite.retries, files, tests };
}

/**
 * Builds the Playwright `projects` array: one project per browser, each filtered
 * to the tests that should run in it (and, when a suite is given, in that suite).
 * @param {string} rootDir
 * @param {string} testDir
 * @param {Suite} [suite]
 */
export function browserProjects(rootDir, testDir, suite) {
  const { defaultBrowsers, tests } = loadBrowserPlan(rootDir);
  const titles = Object.keys(tests);
  const isFolder = (/** @type {string} */ file) => fs.statSync(path.resolve(testDir, file)).isDirectory();

  const browserProjectList = Object.entries(BROWSERS).map(([name, use]) => {
    const runsHere = titles.filter((title) => tests[title].includes(name));
    const notHere = titles.filter((title) => !tests[title].includes(name));
    const byDefault = defaultBrowsers.includes(name);

    /** @type {string[]} */
    let include;
    if (!suite) {
      // Everything, or only the tests assigned to this browser.
      include = byDefault ? [] : runsHere.map((t) => `(^| )${titlePattern(t)}`);
    } else if (byDefault) {
      // The suite's tests, minus those assigned elsewhere (handled by grepInvert).
      include = [
        ...suite.tests.map((t) => `(^| )${titlePattern(t)}`),
        ...suite.files.map((f) => filePattern(name, f, isFolder(f))),
      ];
    } else {
      // Only suite tests that browsers.json assigns to this browser.
      include = [
        ...suite.tests.filter((t) => tests[t]?.includes(name)).map((t) => `(^| )${titlePattern(t)}`),
        ...suite.files.flatMap((f) => runsHere.map((t) => `${filePattern(name, f, isFolder(f))}(.* )?${titlePattern(t)}`)),
      ];
    }

    /** @type {import('@playwright/test').Project} */
    const project = { name, use, testIgnore: `**/${API_TEST_DIR}/**` };
    if (include.length > 0) project.grep = include.map((p) => new RegExp(p));
    // A never-matching pattern keeps the project empty when nothing is assigned to it.
    else if (suite || !byDefault) project.grep = /$^/;
    if (byDefault && notHere.length > 0) project.grepInvert = notHere.map((t) => new RegExp(`(^| )${titlePattern(t)}`));
    return project;
  });

  // API tests need no browser: they run once, in their own "api" project.
  // browsers.json doesn't apply to them; a suite picks them by folder, file or title.
  /** @type {import('@playwright/test').Project} */
  const apiProject = { name: 'api', testMatch: `**/${API_TEST_DIR}/**/*.spec.js` };
  if (suite) {
    const include = [
      ...suite.tests.map((t) => `(^| )${titlePattern(t)}`),
      ...suite.files.map((f) => filePattern('api', f, isFolder(f))),
    ];
    apiProject.grep = include.length > 0 ? include.map((p) => new RegExp(p)) : /$^/;
  }

  return [...browserProjectList, apiProject];
}
