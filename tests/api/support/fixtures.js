// @ts-check

// Fixtures for API tests. Import `test` and `expect` from here (not from
// '@playwright/test') in every API spec file:
//
//   import { test, expect } from '../support/fixtures';
//
//   test('GET /api/users returns users', async ({ api }) => { ... });
//
// Fixtures available in API tests:
//   api      a request context that is already logged in (sends the Bearer token)
//   anonApi  a request context with no token, for testing 401 responses
//
// Both send requests to API_BASE_URL (utilities/globalApi.js), so tests use paths
// like '/api/users' rather than full URLs.

import { test as base, expect } from '@playwright/test';
import { API_BASE_URL, API_CREDENTIALS, ENDPOINTS } from '../../../utilities/globalApi';

/**
 * @typedef {import('@playwright/test').APIRequestContext} APIRequestContext
 * @typedef {{ api: APIRequestContext, anonApi: APIRequestContext }} ApiFixtures
 * @typedef {{ token: string }} ApiWorkerFixtures
 */

/** @type {import('@playwright/test').TestType<import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions & ApiFixtures, import('@playwright/test').PlaywrightWorkerArgs & import('@playwright/test').PlaywrightWorkerOptions & ApiWorkerFixtures>} */
export const test = base.extend({
  // Logs in once per worker and shares the token with every test in that worker.
  token: [async ({ playwright }, use) => {
    const context = await playwright.request.newContext({ baseURL: API_BASE_URL });
    const response = await context.post(ENDPOINTS.login, { data: API_CREDENTIALS });
    if (!response.ok()) {
      throw new Error(`Login to ${API_BASE_URL} failed with ${response.status()}: ${await response.text()}`);
    }
    const { token } = await response.json();
    await context.dispose();
    await use(token);
  }, { scope: 'worker' }],

  api: async ({ playwright, token }, use) => {
    const context = await playwright.request.newContext({
      baseURL: API_BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await use(context);
    await context.dispose();
  },

  anonApi: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({ baseURL: API_BASE_URL });
    await use(context);
    await context.dispose();
  },
});

export { expect };

/** A value that is different every time, for unique emails and names. */
export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Test data for a new user. Every call gives a unique email, so tests running in
 * parallel never clash. Override any field: newUser({ role: 'admin' }).
 * @param {Partial<{ name: string, email: string, role: string, status: string }>} [overrides]
 */
export const newUser = (overrides = {}) => {
  const id = unique();
  return { name: `Test User ${id}`, email: `test.${id}@example.com`, role: 'developer', ...overrides };
};

/** An id that no user will ever have. */
export const MISSING_ID = 999999;
