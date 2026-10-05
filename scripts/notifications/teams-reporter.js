// Posts a run's result to a Microsoft Teams channel as an Adaptive Card, through a
// Teams Workflows webhook ("Send webhook alerts to a channel" / trigger "When a Teams
// webhook request is received"). Office 365 Connector webhooks were retired in May 2026.
//
// What the webhook can and can't do (Microsoft docs, 2026):
//   - it can only ADD a message; it can't read, edit or delete earlier ones
//   - message size limit about 28 KB; throttled above ~4 requests per second
//   - it answers 202 Accepted: the workflow then posts the card asynchronously, so a
//     card the workflow can't render shows up as a failed run in the workflow's history
//
// The webhook URL is a secret (its sig= part authorises posting): it is read from an
// environment variable and never logged.

const STATUS = {
  passed: { emoji: '✅', label: 'PASSED', style: 'good', color: 'Good' },
  failed: { emoji: '❌', label: 'FAILED', style: 'attention', color: 'Attention' },
  partial: { emoji: '⚠️', label: 'PARTIAL', style: 'warning', color: 'Warning' },
  error: { emoji: '🚨', label: 'EXECUTION ERROR', style: 'attention', color: 'Attention' },
};
const MAX_PAYLOAD_BYTES = 27 * 1024; // stay under Teams' ~28 KB limit
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** 05-Oct-2026 11:30 AM (GMT+5:30) */
function formatDate(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const h = d.getHours() % 12 || 12;
  const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find((x) => x.type === 'timeZoneName')?.value ?? '';
  return `${p(d.getDate())}-${month}-${d.getFullYear()} ${p(h)}:${p(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}${zone ? ` (${zone})` : ''}`;
}

/** 19m 03s */
function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Builds the Adaptive Card for a RunResult (see run-result.js).
 * @param {any} r
 * @param {{ compact?: boolean }} [options] compact drops the failed-test list (used if the card is too big)
 */
function buildCard(r, { compact = false } = {}) {
  const st = STATUS[r.status] ?? STATUS.error;
  const t = r.totals;
  const browsers = r.browsers.map((b) => (b === 'api' ? 'api (no browser)' : b)).join(', ') || '–';

  const count = (label, value, color) => ({
    type: 'Column', width: 'stretch',
    items: [
      { type: 'TextBlock', text: String(value), size: 'ExtraLarge', weight: 'Bolder', horizontalAlignment: 'Center', ...(color && value ? { color } : {}) },
      { type: 'TextBlock', text: label, isSubtle: true, size: 'Small', horizontalAlignment: 'Center', spacing: 'None' },
    ],
  });

  /** @type {any[]} */
  const body = [
    {
      type: 'Container', style: st.style, bleed: true,
      items: [
        { type: 'TextBlock', text: '🧪 Automation Test Execution', weight: 'Bolder', size: 'Medium' },
        { type: 'TextBlock', text: `${st.emoji} ${st.label}`, weight: 'Bolder', size: 'ExtraLarge', color: st.color, spacing: 'Small' },
        { type: 'TextBlock', text: `${r.project.displayName} · ${r.runNumber ? `Run #${r.runNumber}` : 'Sample message (npm run test:teams)'}`, isSubtle: true, spacing: 'None', wrap: true },
      ],
    },
    {
      type: 'ColumnSet', spacing: 'Medium', separator: true,
      columns: [
        count('Total', t.total),
        count('✅ Passed', t.passed, 'Good'),
        count('❌ Failed', t.failed, 'Attention'),
        count('🔁 Flaky', t.flaky, 'Warning'),
        count('⏭ Skipped', t.skipped),
      ],
    },
    {
      type: 'FactSet', spacing: 'Medium', separator: true,
      facts: [
        { title: 'Project', value: r.project.displayName },
        ...(r.project.application && r.project.application !== r.project.displayName ? [{ title: 'Application', value: r.project.application }] : []),
        { title: 'Environment', value: r.project.environment || '–' },
        { title: 'Browser', value: browsers },
        { title: 'Suites', value: r.suites.map((s) => s.name).join(', ') || '–' },
        { title: 'Duration', value: formatDuration(r.durationMs) },
        { title: 'Started', value: formatDate(r.startTime) },
        { title: 'Completed', value: formatDate(r.endTime) },
        { title: 'Run ID', value: r.runId },
      ],
    },
  ];

  if (r.errorMessage) {
    body.push({
      type: 'Container', style: 'attention', spacing: 'Medium',
      items: [{ type: 'TextBlock', text: `🚨 ${truncate(r.errorMessage, 400)}`, wrap: true }],
    });
  }

  if (r.suites.length > 1) {
    body.push(
      { type: 'TextBlock', text: 'Suites', weight: 'Bolder', spacing: 'Medium', separator: true },
      {
        type: 'FactSet', spacing: 'Small',
        facts: r.suites.map((s) => ({
          title: `${(STATUS[s.status] ?? STATUS.error).emoji} ${s.name}`,
          value: `${s.passed + s.flaky}/${s.total} passed${s.failed ? `, ${s.failed} failed` : ''}${s.skipped ? `, ${s.skipped} skipped` : ''} · ${formatDuration(s.durationMs)}`,
        })),
      },
    );
  }

  if (!compact && r.failures.length) {
    body.push({
      type: 'TextBlock', spacing: 'Medium', separator: true, weight: 'Bolder',
      text: `❌ Failed tests${r.failureCount > r.failures.length ? ` (first ${r.failures.length} of ${r.failureCount})` : ''}`,
    });
    for (const f of r.failures) {
      body.push(
        { type: 'TextBlock', text: truncate(f.title, 150), weight: 'Bolder', wrap: true, spacing: 'Small' },
        { type: 'TextBlock', text: truncate(`${[...new Set([f.browser, f.suite].filter(Boolean))].join(' · ')} — ${f.error || 'no error message'}`, 220), wrap: true, isSubtle: true, size: 'Small', spacing: 'None' },
      );
    }
  } else if (compact && r.failureCount) {
    body.push({ type: 'TextBlock', text: `❌ ${r.failureCount} failed test(s): see the detailed report.`, wrap: true, spacing: 'Medium', separator: true });
  }

  const actions = [];
  if (r.reportUrl) actions.push({ type: 'Action.OpenUrl', title: '📊 Detailed Report', url: r.reportUrl });
  if (r.ciUrl) actions.push({ type: 'Action.OpenUrl', title: '🔗 CI run', url: r.ciUrl });
  if (!actions.length) {
    // No shareable link exists: say where the report is instead of showing a dead link.
    body.push({
      type: 'TextBlock', isSubtle: true, size: 'Small', wrap: true, spacing: 'Medium', separator: true,
      text: `📊 Detailed report: ${r.localReport} on ${r.host}, and attached to the result email.`,
    });
  }

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    msteams: { width: 'Full' },
    body,
    ...(actions.length ? { actions } : {}),
  };
}

/** The envelope Teams Workflows webhooks expect for Adaptive Cards. */
function buildPayload(runResult) {
  const wrap = (card) => ({
    type: 'message',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }],
  });
  let payload = wrap(buildCard(runResult));
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) payload = wrap(buildCard(runResult, { compact: true }));
  return payload;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POSTs the payload. Retries network errors, timeouts, 408/425/429 and 5xx a few times
 * (honouring Retry-After, capped); never retries other 4xx (bad URL, bad payload,
 * disabled workflow). Never throws.
 * @returns {Promise<{ ok: boolean, status?: number, attempts: number, error?: string }>}
 */
async function postToWebhook(webhookUrl, payload, { attempts = 3, timeoutMs = 15000, log = (m) => console.log(`[Teams] ${m}`) } = {}) {
  let url;
  try {
    url = new URL(webhookUrl);
    if (url.protocol !== 'https:') throw new Error('not https');
  } catch {
    return { ok: false, attempts: 0, error: 'The webhook URL is not a valid https:// URL (check the environment variable).' };
  }

  let last = { ok: false, attempts: 0, error: 'not sent' };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let retryAfterMs = 0;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return { ok: true, status: response.status, attempts: attempt };
      const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      last = { ok: false, status: response.status, attempts: attempt, error: `HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}` };
      if (!RETRYABLE.has(response.status)) return last;
      const retryAfter = Number(response.headers.get('retry-after'));
      if (retryAfter > 0) retryAfterMs = Math.min(retryAfter * 1000, 30000);
    } catch (error) {
      const name = /** @type {Error} */ (error).name;
      last = {
        ok: false, attempts: attempt,
        error: name === 'TimeoutError' ? `No response within ${timeoutMs / 1000}s` : `Network error: ${/** @type {any} */ (error).cause?.code ?? /** @type {Error} */ (error).message}`,
      };
    }
    if (attempt < attempts) {
      const wait = retryAfterMs || 2000 * 2 ** (attempt - 1);
      log(`Attempt ${attempt} failed (${last.error.split(':')[0]}); retrying in ${Math.round(wait / 1000)}s...`);
      await sleep(wait);
    }
  }
  return last;
}

module.exports = { buildPayload, postToWebhook };
