// @ts-check
import { test, expect } from '../support/fixtures';
import { call } from '../support/http';
import { postSteps } from './users.post.steps';
import { API_CREDENTIALS, ENDPOINTS } from '../../../utilities/globalApi';

test.describe('POST login', () => {
  test('POST /api/auth/login returns a Bearer token', async ({ anonApi }) => {
    const login = await postSteps['POST login'](anonApi, API_CREDENTIALS);
    expect(login).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600 });
    expect(login.token).toMatch(/^[0-9a-f]{48}$/);
  });

  test('POST /api/auth/login rejects a wrong password', async ({ anonApi }) => {
    const res = await call(anonApi, 'POST', ENDPOINTS.login, { data: { ...API_CREDENTIALS, password: 'wrong' } });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password');
  });

  test('POST /api/auth/login rejects a missing password', async ({ anonApi }) => {
    const res = await call(anonApi, 'POST', ENDPOINTS.login, { data: { username: API_CREDENTIALS.username } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });
});
