// @ts-check

// OPTIONS steps: reusable requests with their checks.
// OPTIONS asks the server which methods a URL supports (the Allow header).
// Used by the tests in this folder and by flows (tests/api/flows/).

import { expect } from '@playwright/test';
import { ENDPOINTS } from '../../../utilities/globalApi';
import { call } from '../support/http';

export const optionsSteps = {
  /**
   * Reads the allowed methods. Params: { id } for one user, or nothing for the users collection.
   * Returns { allow: ['GET', 'POST', ...] }.
   */
  'OPTIONS allowed methods': async (api, { id } = {}) => {
    const url = id === undefined ? ENDPOINTS.users : ENDPOINTS.user(id);
    const res = await call(api, 'OPTIONS', url);
    expect(res.status, `OPTIONS ${url} should return 204`).toBe(204);
    const allow = (res.headers.allow ?? '').split(',').map((m) => m.trim()).filter(Boolean);
    expect(allow.length, 'Allow header should list methods').toBeGreaterThan(0);
    return { allow };
  },
};
