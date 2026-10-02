// @ts-check

// call(): sends one HTTP request and returns { status, headers, body, response }.
//
// Every call is also attached to the test report (dashboard and Playwright report),
// showing the request and the response, so a failing API test shows exactly what
// was sent and received.

import { test } from '@playwright/test';

const MAX_BODY = 4000; // characters of each body shown in the report

/** @param {unknown} value */
const show = (value) => {
  if (value === undefined || value === '') return '(empty)';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n… (truncated)` : text;
};

/**
 * @param {import('@playwright/test').APIRequestContext} api
 * @param {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'} method
 * @param {string} url  path such as '/api/users/1' (the base URL comes from the fixture)
 * @param {{ data?: unknown, params?: Record<string, string | number | boolean>, headers?: Record<string, string> }} [options]
 */
export async function call(api, method, url, options = {}) {
  const started = Date.now();
  const response = await api.fetch(url, { method, ...options });
  const elapsed = Date.now() - started;

  const text = method === 'HEAD' ? '' : await response.text();
  const isJson = (response.headers()['content-type'] ?? '').includes('application/json');
  /** @type {any} */
  let body = text;
  if (isJson && text) {
    try {
      body = JSON.parse(text);
    } catch {
      // keep the raw text
    }
  }

  const query = options.params ? `?${new URLSearchParams(Object.entries(options.params).map(([k, v]) => [k, String(v)]))}` : '';
  const headers = Object.entries(response.headers()).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  await test.info().attach(`${method} ${url}${query} → ${response.status()}`, {
    contentType: 'text/plain',
    body: [
      `REQUEST  ${method} ${url}${query}`,
      options.data !== undefined ? `Body:\n${show(options.data)}` : 'Body: (none)',
      '',
      `RESPONSE ${response.status()} ${response.statusText()} (${elapsed} ms)`,
      `Headers:\n${headers}`,
      `Body:\n${show(body)}`,
    ].join('\n'),
  });

  return { status: response.status(), headers: response.headers(), body, response };
}
