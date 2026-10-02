// @ts-check

// DELETE steps: reusable requests with their checks.
// Used by the tests in this folder and by flows (tests/api/flows/).

import { expect } from '@playwright/test';
import { ENDPOINTS } from '../../../utilities/globalApi';
import { call } from '../support/http';

export const deleteSteps = {
  /** Deletes a user. Params: { id }. Returns nothing (204 has no body). */
  'DELETE user': async (api, { id }) => {
    const res = await call(api, 'DELETE', ENDPOINTS.user(id));
    expect(res.status, `DELETE user ${id} should return 204`).toBe(204);
    expect(res.body).toBe('');
    return undefined;
  },
};
