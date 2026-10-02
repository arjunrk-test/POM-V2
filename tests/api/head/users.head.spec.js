// @ts-check
import { test, expect, MISSING_ID } from '../support/fixtures';
import { call } from '../support/http';
import { headSteps } from './users.head.steps';
import { ENDPOINTS } from '../../../utilities/globalApi';

test.describe('HEAD', () => {
  test('HEAD /api/users/{id} returns headers only for an existing user', async ({ anonApi }) => {
    const headers = await headSteps['HEAD user exists'](anonApi, { id: 1 });
    expect(headers['content-type']).toContain('application/json');
    // Content-Length tells you how big the GET body would be, without downloading it.
    expect(Number(headers['content-length'])).toBeGreaterThan(0);
    expect(Date.parse(headers['last-modified'])).not.toBeNaN();
  });

  test('HEAD /api/users/{id} returns 404 for a missing user', async ({ anonApi }) => {
    await headSteps['HEAD user missing'](anonApi, { id: MISSING_ID });
  });

  test('HEAD /api/users returns the total in X-Total-Count', async ({ anonApi }) => {
    const res = await call(anonApi, 'HEAD', ENDPOINTS.users);
    expect(res.status).toBe(200);
    expect(res.body).toBe('');
    expect(Number(res.headers['x-total-count'])).toBeGreaterThanOrEqual(3);
  });
});
