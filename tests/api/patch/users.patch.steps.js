// @ts-check

// PATCH steps: reusable requests with their checks.
// Used by the tests in this folder and by flows (tests/api/flows/).

import { expect } from '@playwright/test';
import { ENDPOINTS } from '../../../utilities/globalApi';
import { call } from '../support/http';

export const patchSteps = {
  /** Changes some fields of a user. Params: { id, ...fields to change }. Returns the updated user. */
  'PATCH update user': async (api, { id, ...changes }) => {
    const res = await call(api, 'PATCH', ENDPOINTS.user(id), { data: changes });
    expect(res.status, `PATCH user ${id} should return 200`).toBe(200);
    expect(res.body).toMatchObject({ id: Number(id), ...changes });
    return res.body;
  },
};
