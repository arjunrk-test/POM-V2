// @ts-check
import { test, expect, newUser } from '../support/fixtures';
import { call } from '../support/http';
import { postSteps } from './users.post.steps';
import { ENDPOINTS } from '../../../utilities/globalApi';

test.describe('POST', () => {
  test('POST /api/users creates a user', async ({ api }) => {
    const data = newUser({ role: 'manager' });
    const user = await postSteps['POST create user'](api, data);
    expect(user).toMatchObject({ ...data, status: 'active' });
    expect(user.id).toEqual(expect.any(Number));
    expect(Date.parse(user.createdAt)).not.toBeNaN();
  });

  test('POST /api/users fills in default role and status', async ({ api }) => {
    const { role, ...withoutRole } = newUser();
    const user = await postSteps['POST create user'](api, withoutRole);
    expect(user).toMatchObject({ role: 'tester', status: 'active' });
  });

  test('POST /api/users rejects a missing email', async ({ api }) => {
    const res = await call(api, 'POST', ENDPOINTS.users, { data: { name: 'No Email' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.details).toContain('email is required and must be a valid email address');
  });

  test('POST /api/users rejects unknown fields', async ({ api }) => {
    const res = await call(api, 'POST', ENDPOINTS.users, { data: { ...newUser(), salary: 1000 } });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('Unknown field(s): salary');
  });

  test('POST /api/users rejects a duplicate email', async ({ api }) => {
    const res = await call(api, 'POST', ENDPOINTS.users, { data: newUser({ email: 'alice@example.com' }) });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Conflict');
  });

  test('POST /api/users rejects a body that is not JSON', async ({ api }) => {
    // A Buffer is sent as-is (a plain string would be JSON-encoded by Playwright).
    const res = await call(api, 'POST', ENDPOINTS.users, { data: Buffer.from('{not json'), headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Request body is not valid JSON');
  });

  test('POST /api/users requires a token', async ({ anonApi }) => {
    const res = await call(anonApi, 'POST', ENDPOINTS.users, { data: newUser() });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });
});
