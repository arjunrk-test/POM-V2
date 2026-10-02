// @ts-check
import { test, expect, newUser, MISSING_ID } from '../support/fixtures';
import { call } from '../support/http';
import { putSteps } from './users.put.steps';
import { postSteps } from '../post/users.post.steps';
import { ENDPOINTS } from '../../../utilities/globalApi';

test.describe('PUT', () => {
  /** @type {any} */
  let user;

  // Each test gets its own fresh user to change.
  test.beforeEach(async ({ api }) => {
    user = await postSteps['POST create user'](api, newUser({ role: 'admin', status: 'inactive' }));
  });

  test('PUT /api/users/{id} replaces the whole user', async ({ api }) => {
    const replacement = newUser({ role: 'manager', status: 'active' });
    const updated = await putSteps['PUT replace user'](api, { id: user.id, ...replacement });
    expect(updated).toMatchObject(replacement);
    expect(updated.createdAt).toBe(user.createdAt);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(user.updatedAt));
  });

  test('PUT /api/users/{id} resets fields that are not sent', async ({ api }) => {
    const { name, email } = newUser();
    const updated = await putSteps['PUT replace user'](api, { id: user.id, name, email });
    // The user was admin / inactive; PUT without role and status resets them to the defaults.
    expect(updated).toMatchObject({ role: 'tester', status: 'active' });
  });

  test('PUT /api/users/{id} requires name and email', async ({ api }) => {
    const res = await call(api, 'PUT', ENDPOINTS.user(user.id), { data: { role: 'developer' } });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([
      'name is required and must be 2-100 characters',
      'email is required and must be a valid email address',
    ]));
  });

  test('PUT /api/users/{id} returns 404 for a missing user', async ({ api }) => {
    const res = await call(api, 'PUT', ENDPOINTS.user(MISSING_ID), { data: newUser() });
    expect(res.status).toBe(404);
  });

  test('PUT /api/users/{id} requires a token', async ({ anonApi }) => {
    const res = await call(anonApi, 'PUT', ENDPOINTS.user(user.id), { data: newUser() });
    expect(res.status).toBe(401);
  });
});
