// Draws the charts for the report email as PNG images.
// Email clients don't run JavaScript and Outlook doesn't show SVG, so each chart is
// built as SVG, rendered in a headless browser (the same one Playwright tests use),
// and screenshotted to PNG. The email embeds the PNGs inline.

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

// Result colors (status palette). Each one is always shown next to its text label,
// so the charts never rely on color alone.
const STATUS = [
  { key: 'passed', label: 'Passed', color: '#0ca30c' },
  { key: 'failed', label: 'Failed', color: '#d03b3b' },
  { key: 'flaky', label: 'Flaky', color: '#fab219' },
  { key: 'skipped', label: 'Skipped', color: '#9a9893' },
];
const DURATION_COLOR = '#2a78d6';
const SURFACE = '#ffffff';
const TEXT = '#0b0b0b';
const TEXT_MUTED = '#52514e';
const GRID = '#e4e3df';
const WIDTH = 600; // display width in the email, in CSS pixels
const FONT = "'Segoe UI', Arial, sans-serif";

const escapeXml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Keeps the start and end of long names, where tests usually differ.
const truncate = (text, max) => {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) * 0.45);
  return `${text.slice(0, head)}…${text.slice(text.length - (max - 1 - head))}`;
};
const lastTitle = (title) => title.split(' › ').at(-1);
const percent = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : '0%');
const seconds = (ms) => (ms < 10000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);

/** Rectangle with only the right-hand corners rounded (the bar's data end). */
const roundedEnd = (x, y, w, h, r, color) => {
  r = Math.min(r, w, h / 2);
  return `<path fill="${color}" d="M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} z"/>`;
};

const svg = (height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="${FONT}">
  <rect width="${WIDTH}" height="${height}" fill="${SURFACE}"/>${body}</svg>`;

const title = (text) => `<text x="0" y="20" font-size="15" font-weight="600" fill="${TEXT}">${escapeXml(text)}</text>`;

/** Donut of the overall result, pass rate in the middle, labelled legend beside it. */
function statusDonut(summary) {
  const cx = 110, cy = 140, r = 78, stroke = 26;
  const circumference = 2 * Math.PI * r;
  const parts = STATUS.filter((s) => summary[s.key] > 0);
  const gap = parts.length > 1 ? 3 : 0; // surface gap between segments

  let offset = 0;
  const segments = parts.map((s) => {
    const length = (summary[s.key] / summary.total) * circumference;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
      stroke-dasharray="${Math.max(length - gap, 0.5)} ${circumference}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += length;
    return arc;
  });

  const rate = percent(summary.passed, summary.total);
  const legend = STATUS.map((s, i) => {
    const y = 88 + i * 34;
    const count = summary[s.key];
    const muted = count === 0;
    return `<rect x="250" y="${y - 12}" width="14" height="14" rx="3" fill="${s.color}" opacity="${muted ? 0.35 : 1}"/>
      <text x="274" y="${y}" font-size="14" fill="${muted ? TEXT_MUTED : TEXT}">${s.label}</text>
      <text x="420" y="${y}" font-size="14" font-weight="600" fill="${muted ? TEXT_MUTED : TEXT}" text-anchor="end">${count}</text>
      <text x="480" y="${y}" font-size="13" fill="${TEXT_MUTED}" text-anchor="end">${percent(count, summary.total)}</text>`;
  }).join('');

  return svg(250, `${title('Overall result')}
    ${segments.join('')}
    <text x="${cx}" y="${cy + 4}" font-size="30" font-weight="700" fill="${TEXT}" text-anchor="middle">${rate}</text>
    <text x="${cx}" y="${cy + 26}" font-size="12" fill="${TEXT_MUTED}" text-anchor="middle">passed</text>
    ${legend}
    <text x="250" y="${88 + 4 * 34}" font-size="12" fill="${TEXT_MUTED}">${summary.total} test run(s)</text>`);
}

/** One stacked bar per browser, all on the same scale. */
function browserBars(summary) {
  const labelWidth = 90, valueWidth = 110, barHeight = 22, rowGap = 18, top = 70;
  const plotWidth = WIDTH - labelWidth - valueWidth;
  const max = Math.max(...summary.browsers.map((b) => b.total), 1);

  const legend = STATUS.map((s, i) => `<rect x="${i * 90}" y="38" width="12" height="12" rx="3" fill="${s.color}"/>
    <text x="${i * 90 + 18}" y="49" font-size="13" fill="${TEXT_MUTED}">${s.label}</text>`).join('');

  const rows = summary.browsers.map((b, row) => {
    const y = top + row * (barHeight + rowGap);
    const parts = STATUS.filter((s) => b[s.key] > 0);
    let x = labelWidth;
    const bars = parts.map((s, i) => {
      const w = (b[s.key] / max) * plotWidth;
      const last = i === parts.length - 1;
      const drawn = last ? w : Math.max(w - 2, 1); // 2px surface gap between segments
      const mark = last ? roundedEnd(x, y, drawn, barHeight, 4, s.color) : `<rect x="${x}" y="${y}" width="${drawn}" height="${barHeight}" fill="${s.color}"/>`;
      x += w;
      return mark;
    }).join('');
    return `<text x="0" y="${y + 16}" font-size="14" fill="${TEXT}">${escapeXml(b.name)}</text>
      <line x1="${labelWidth}" y1="${y - 4}" x2="${labelWidth}" y2="${y + barHeight + 4}" stroke="${GRID}"/>
      ${bars}
      <text x="${x + 10}" y="${y + 16}" font-size="13" fill="${TEXT_MUTED}">${b.passed}/${b.total} passed</text>`;
  }).join('');

  const height = top + summary.browsers.length * (barHeight + rowGap) + 6;
  return svg(height, `${title('Results by browser')}${legend}${rows}`);
}

/** Slowest test runs, longest first. */
function slowestTests(summary, limit = 8) {
  const runs = [...summary.tests].filter((t) => t.status !== 'skipped').sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
  const labelWidth = 300, valueWidth = 50, barHeight = 16, rowGap = 12, top = 44;
  const plotWidth = WIDTH - labelWidth - valueWidth;
  const max = Math.max(...runs.map((t) => t.durationMs), 1);

  const rows = runs.map((t, row) => {
    const y = top + row * (barHeight + rowGap);
    const w = Math.max((t.durationMs / max) * plotWidth, 2);
    return `<text x="${labelWidth - 10}" y="${y + 12}" font-size="12" fill="${TEXT}" text-anchor="end">${escapeXml(truncate(lastTitle(t.title), 34))}
        <tspan fill="${TEXT_MUTED}"> · ${escapeXml(t.browser)}</tspan></text>
      ${roundedEnd(labelWidth, y, w, barHeight, 4, DURATION_COLOR)}
      <text x="${labelWidth + w + 8}" y="${y + 12}" font-size="12" fill="${TEXT_MUTED}">${seconds(t.durationMs)}</text>`;
  }).join('');

  const height = top + runs.length * (barHeight + rowGap) + 4;
  return svg(height, `${title(runs.length < summary.tests.length ? `Slowest ${runs.length} test runs` : 'Test duration')}${rows}`);
}

/** Launches a browser for rendering: installed Chrome, then Edge, then Playwright's Chromium. */
async function launchBrowser() {
  let lastError;
  for (const options of [{ channel: 'chrome' }, { channel: 'msedge' }, {}]) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Renders the charts to PNG files in outDir.
 * @returns {Promise<{ cid: string, file: string, alt: string, width: number }[]>}
 */
async function renderCharts(summary, outDir) {
  const charts = [
    { cid: 'chart-overall', svg: statusDonut(summary),
      alt: `Overall result: ${summary.passed} passed, ${summary.failed} failed, ${summary.flaky} flaky, ${summary.skipped} skipped` },
    { cid: 'chart-browsers', svg: browserBars(summary),
      alt: `Results by browser: ${summary.browsers.map((b) => `${b.name} ${b.passed}/${b.total} passed`).join(', ')}` },
  ];
  if (summary.tests.filter((t) => t.status !== 'skipped').length >= 2) {
    charts.push({ cid: 'chart-durations', svg: slowestTests(summary), alt: 'Slowest test runs by duration' });
  }

  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launchBrowser();
  try {
    // 2x pixel density so the images stay sharp; the email shows them at WIDTH.
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: WIDTH, height: 400 } });
    const result = [];
    for (const chart of charts) {
      await page.setContent(`<html><body style="margin:0;background:${SURFACE}">${chart.svg}</body></html>`);
      const file = path.join(outDir, `${chart.cid}.png`);
      await page.locator('svg').screenshot({ path: file });
      result.push({ cid: chart.cid, file, alt: chart.alt, width: WIDTH });
    }
    return result;
  } finally {
    await browser.close();
  }
}

module.exports = { renderCharts };
