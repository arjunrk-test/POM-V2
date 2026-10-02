// @ts-check
import { test, expect, MISSING_ID } from '../support/fixtures';
import { call } from '../support/http';
import { getSteps } from './users.get.steps';
import { ENDPOINTS } from '../../../utilities/globalApi';

test.describe('GET', () => {
  test('GET /api/health reports the server is up', async ({ anonApi }) => {
    const res = await call(anonApi, 'GET', ENDPOINTS.health);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  test('GET /api/users returns a page of users', async ({ anonApi }) => {
    const list = await getSteps['GET users list'](anonApi);
    expect(list.total).toBeGreaterThanOrEqual(3);
    expect(list).toMatchObject({ page: 1, limit: 10 });
    for (const user of list.data) {
      expect(user).toEqual(expect.objectContaining({
        id: expect.any(Number), name: expect.any(String), email: expect.any(String),
        role: expect.any(String), status: expect.any(String),
      }));
    }
  });

  test('GET /api/users filters by role', async ({ anonApi }) => {
    const list = await getSteps['GET users list'](anonApi, { role: 'admin' });
    expect(list.data.length).toBeGreaterThan(0);
    expect(list.data.every((u) => u.role === 'admin')).toBe(true);
  });

  test('GET /api/users pages the results', async ({ anonApi }) => {
    const list = await getSteps['GET users list'](anonApi, { limit: 1, page: 2 });
    expect(list.data).toHaveLength(1);
    expect(list).toMatchObject({ page: 2, limit: 1 });
  });

  test('GET /api/users rejects an unknown role', async ({ anonApi }) => {
    const res = await call(anonApi, 'GET', ENDPOINTS.users, { params: { role: 'pilot' } });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('role must be one of');
  });

  test('GET /api/users/{id} returns one user', async ({ anonApi }) => {
    const user = await getSteps['GET user by id'](anonApi, { id: 1 });
    expect(user).toMatchObject({ id: 1, name: 'Alice Admin', email: 'alice@example.com', role: 'admin' });
  });

  test('GET /api/users/{id} returns 404 for a missing user', async ({ anonApi }) => {
    const error = await getSteps['GET user not found'](anonApi, { id: MISSING_ID });
    expect(error.message).toBe(`User ${MISSING_ID} not found`);
  });

  test('GET /api/users/{id} returns 400 for an id that is not a number', async ({ anonApi }) => {
    const res = await call(anonApi, 'GET', ENDPOINTS.user('abc'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BadRequest');
  });
});
