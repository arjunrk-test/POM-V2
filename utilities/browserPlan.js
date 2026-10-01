// @ts-check

// Reads the test plan (a JSON file mapping test titles to browsers) and turns it
// into one Playwright project per browser, each filtered to only the tests that
// should run in that browser.
//
// Plan file format:
//   {
//     "defaultBrowsers": ["chrome"],            // browsers for tests NOT listed below ([] = don't run them)
//     "tests": {
//       "user can log in with valid credentials": ["chrome", "edge"]
//     }
//   }
//
// The plan file defaults to test-plans/browsers.json and can be switched with
// the TEST_PLAN environment variable, e.g. TEST_PLAN=test-plans/smoke.json.

import fs from 'fs';
import path from 'path';
import { devices } from '@playwright/test';

/** Every browser a plan may refer to, keyed by the name used in the plan file. */
export const BROWSERS = {
  chrome: { ...devices['Desktop Chrome'], channel: 'chrome' },
  edge: { ...devices['Desktop Edge'], channel: 'msedge' },
};

export const DEFAULT_PLAN = 'test-plans/browsers.json';

/** @param {string} text */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Playwright greps against "<file> <describe titles...> <test title> <@tags...>",
// so match the test title at the end, optionally followed by tags.
/** @param {string} title */
const exactTitle = (title) => new RegExp(`(^| )${escapeRegExp(title)}( @\\S+)*$`);

/**
 * @param {string} rootDir directory the plan path is relative to
 * @returns {{ defaultBrowsers: string[], tests: Record<string, string[]> }}
 */
export function loadPlan(rootDir) {
  const planPath = path.resolve(rootDir, process.env.TEST_PLAN || DEFAULT_PLAN);
  if (!fs.existsSync(planPath)) {
    throw new Error(`Test plan not found: ${planPath}`);
  }

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
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

/**
 * Builds the Playwright `projects` array from the plan.
 * @param {string} rootDir
 */
export function browserProjects(rootDir) {
  const { defaultBrowsers, tests } = loadPlan(rootDir);
  const titles = Object.keys(tests);

  return Object.entries(BROWSERS).map(([name, use]) => {
    const included = titles.filter((title) => tests[title].includes(name)).map(exactTitle);
    const excluded = titles.filter((title) => !tests[title].includes(name)).map(exactTitle);

    // Unlisted tests run here by default: run everything except tests assigned elsewhere.
    if (defaultBrowsers.includes(name)) {
      return excluded.length ? { name, use, grepInvert: excluded } : { name, use };
    }

    // Unlisted tests don't run here: run only tests assigned to this browser.
    // A never-matching pattern keeps the project empty when nothing is assigned.
    return { name, use, grep: included.length ? included : [/$^/] };
  });
}
