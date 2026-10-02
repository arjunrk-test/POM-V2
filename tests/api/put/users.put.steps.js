// @ts-check

// PUT steps: reusable requests with their checks.
// Used by the tests in this folder and by flows (tests/api/flows/).

import { expect } from '@playwright/test';
import { ENDPOINTS } from '../../../utilities/globalApi';
import { call } from '../support/http';

export const putSteps = {
  /** Replaces a whole user. Params: { id, name, email, role?, status? }. Returns the updated user. */
  'PUT replace user': async (api, { id, ...user }) => {
    const res = await call(api, 'PUT', ENDPOINTS.user(id), { data: user });
    expect(res.status, `PUT user ${id} should return 200`).toBe(200);
    expect(res.body).toMatchObject({ id: Number(id), ...user });
    return res.body;
  },
};
