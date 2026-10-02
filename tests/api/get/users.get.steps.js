// @ts-check

// GET steps: reusable requests with their checks.
// Used by the tests in this folder and by flows (tests/api/flows/) that link
// several methods together. Each step: async (api, params) => result.

import { expect } from '@playwright/test';
import { ENDPOINTS } from '../../../utilities/globalApi';
import { call } from '../support/http';

export const getSteps = {
  /** Reads one user and checks it exists. Params: { id }. Returns the user. */
  'GET user by id': async (api, { id }) => {
    const res = await call(api, 'GET', ENDPOINTS.user(id));
    expect(res.status, `GET user ${id} should return 200`).toBe(200);
    expect(res.body).toMatchObject({ id: Number(id) });
    return res.body;
  },

  /** Checks a user does NOT exist. Params: { id }. Returns the error body. */
  'GET user not found': async (api, { id }) => {
    const res = await call(api, 'GET', ENDPOINTS.user(id));
    expect(res.status, `GET user ${id} should return 404`).toBe(404);
    expect(res.body).toMatchObject({ error: 'NotFound' });
    return res.body;
  },

  /** Lists users. Params: any of { role, status, search, page, limit }. Returns { data, total, page, limit }. */
  'GET users list': async (api, query = {}) => {
    const res = await call(api, 'GET', ENDPOINTS.users, { params: query });
    expect(res.status, 'GET users should return 200').toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.headers['x-total-count']).toBe(String(res.body.total));
    return res.body;
  },
};
