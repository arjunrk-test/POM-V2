// @ts-check
import { test, expect, newUser, MISSING_ID } from '../support/fixtures';
import { call } from '../support/http';
import { patchSteps } from './users.patch.steps';
import { postSteps } from '../post/users.post.steps';
import { ENDPOINTS } from '../../../utilities/globalApi';

test.describe('PATCH', () => {
  /** @type {any} */
  let user;

  test.beforeEach(async ({ api }) => {
    user = await postSteps['POST create user'](api, newUser({ role: 'developer' }));
  });

  test('PATCH /api/users/{id} changes only the fields sent', async ({ api }) => {
    const updated = await patchSteps['PATCH update user'](api, { id: user.id, status: 'inactive' });
    expect(updated).toMatchObject({ name: user.name, email: user.email, role: 'developer', status: 'inactive' });
  });

  test('PATCH /api/users/{id} can change several fields at once', async ({ api }) => {
    const updated = await patchSteps['PATCH update user'](api, { id: user.id, name: 'Renamed User', role: 'manager' });
    expect(updated).toMatchObject({ name: 'Renamed User', role: 'manager', email: user.email });
  });

  test('PATCH /api/users/{id} rejects an empty body', async ({ api }) => {
    const res = await call(api, 'PATCH', ENDPOINTS.user(user.id), { data: {} });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('Provide at least one of: name, email, role, status');
  });

  test('PATCH /api/users/{id} rejects an invalid status', async ({ api }) => {
    const res = await call(api, 'PATCH', ENDPOINTS.user(user.id), { data: { status: 'sleeping' } });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('status must be one of: active, inactive');
  });

  test('PATCH /api/users/{id} rejects an email another user has', async ({ api }) => {
    const res = await call(api, 'PATCH', ENDPOINTS.user(user.id), { data: { email: 'alice@example.com' } });
    expect(res.status).toBe(409);
  });

  test('PATCH /api/users/{id} returns 404 for a missing user', async ({ api }) => {
    const res = await call(api, 'PATCH', ENDPOINTS.user(MISSING_ID), { data: { status: 'inactive' } });
    expect(res.status).toBe(404);
  });
});
