// @ts-check

// POST steps: reusable requests with their checks.
// Used by the tests in this folder and by flows (tests/api/flows/).

import { expect } from '@playwright/test';
import { ENDPOINTS } from '../../../utilities/globalApi';
import { call } from '../support/http';

export const postSteps = {
  /** Creates a user. Params: { name, email, role?, status? }. Returns the new user (with its id). */
  'POST create user': async (api, user) => {
    const res = await call(api, 'POST', ENDPOINTS.users, { data: user });
    expect(res.status, 'POST user should return 201').toBe(201);
    expect(res.body).toMatchObject({ name: user.name, email: user.email });
    expect(res.headers.location).toBe(ENDPOINTS.user(res.body.id));
    return res.body;
  },

  /** Logs in. Params: { username, password }. Returns { token, tokenType, expiresIn }. */
  'POST login': async (api, credentials) => {
    const res = await call(api, 'POST', ENDPOINTS.login, { data: credentials });
    expect(res.status, 'login should return 200').toBe(200);
    expect(res.body.token).toBeTruthy();
    return res.body;
  },
};
