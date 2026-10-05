// Execution history kept by the framework (one small JSON file per Teams project):
//   reports/history/<projectKey>.json
//
// Why: Teams Workflows webhooks can only ADD messages; they can't read, edit or delete
// them. So Teams is the visible history feed, and this file is the structured history:
//   - the run number and Run ID of every execution (PROJECT1-20261005-00105)
//   - the last N runs (teams.historySize in project.json, default 50) with their results
//     and whether email / Teams were notified
//   - duplicate detection: the same results are never posted to Teams twice
//
// No database: a JSON file written atomically (write to a temp file, then rename).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const HISTORY_DIR = path.join(ROOT, 'reports', 'history');

const historyFile = (projectKey) => path.join(HISTORY_DIR, `${projectKey}.json`);

/** @returns {{ project: string, lastRunNumber: number, runs: any[] }} */
function loadHistory(projectKey) {
  try {
    const data = JSON.parse(fs.readFileSync(historyFile(projectKey), 'utf-8'));
    return { project: projectKey, lastRunNumber: Number(data.lastRunNumber) || 0, runs: Array.isArray(data.runs) ? data.runs : [] };
  } catch {
    return { project: projectKey, lastRunNumber: 0, runs: [] };
  }
}

/** Saves the history, keeping only the newest `size` runs. */
function saveHistory(projectKey, history, size = 50) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const runs = history.runs.slice(-Math.max(1, size));
  const file = historyFile(projectKey);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ project: projectKey, lastRunNumber: history.lastRunNumber, runs }, null, 2));
  fs.renameSync(temp, file);
}

/**
 * The run number: from the CI system when there is one (so it matches the CI build
 * number), otherwise the next number in the local history.
 */
function nextRunNumber(history) {
  const fromEnv = Number(process.env.RUN_NUMBER || process.env.GITHUB_RUN_NUMBER || process.env.BUILD_NUMBER);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : history.lastRunNumber + 1;
}

/** PROJECT1-20261005-00105 */
function makeRunId(projectKey, date, runNumber) {
  const p = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  return `${projectKey.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${day}-${String(runNumber).padStart(5, '0')}`;
}

/**
 * Identifies one set of results: the suites plus the exact results.json files they
 * produced. Re-notifying the same results gives the same fingerprint; a new execution
 * writes new results.json files and so gets a new one.
 */
function fingerprint(suiteNames) {
  const hash = crypto.createHash('sha1');
  for (const name of [...suiteNames].sort()) {
    const file = path.join(ROOT, 'reports', name, 'results.json');
    let stamp = 'missing';
    try {
      const stat = fs.statSync(file);
      stamp = `${stat.size}:${stat.mtimeMs}`;
    } catch {
      // no results for this suite
    }
    hash.update(`${name}=${stamp};`);
  }
  return hash.digest('hex').slice(0, 16);
}

module.exports = { loadHistory, saveHistory, nextRunNumber, makeRunId, fingerprint };
