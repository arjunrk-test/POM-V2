// @ts-check

// HEAD steps: reusable requests with their checks.
// HEAD is GET without the body: it answers "does this exist?" cheaply.
// Used by the tests in this folder and by flows (tests/api/flows/).

import { expect } from '@playwright/test';
import { ENDPOINTS } from '../../../utilities/globalApi';
import { call } from '../support/http';

export const headSteps = {
  /** Checks a user exists, without downloading it. Params: { id }. Returns the response headers. */
  'HEAD user exists': async (api, { id }) => {
    const res = await call(api, 'HEAD', ENDPOINTS.user(id));
    expect(res.status, `HEAD user ${id} should return 200`).toBe(200);
    expect(res.body).toBe('');
    return res.headers;
  },

  /** Checks a user does NOT exist. Params: { id }. Returns the response headers. */
  'HEAD user missing': async (api, { id }) => {
    const res = await call(api, 'HEAD', ENDPOINTS.user(id));
    expect(res.status, `HEAD user ${id} should return 404`).toBe(404);
    return res.headers;
  },
};
