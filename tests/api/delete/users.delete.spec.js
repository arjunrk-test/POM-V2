// @ts-check
import { test, expect, newUser, MISSING_ID } from '../support/fixtures';
import { call } from '../support/http';
import { deleteSteps } from './users.delete.steps';
import { postSteps } from '../post/users.post.steps';
import { getSteps } from '../get/users.get.steps';
import { ENDPOINTS } from '../../../utilities/globalApi';

test.describe('DELETE', () => {
  test('DELETE /api/users/{id} deletes a user', async ({ api }) => {
    const user = await postSteps['POST create user'](api, newUser());
    await deleteSteps['DELETE user'](api, { id: user.id });
    await getSteps['GET user not found'](api, { id: user.id });
  });

  test('DELETE /api/users/{id} twice returns 404 the second time', async ({ api }) => {
    const user = await postSteps['POST create user'](api, newUser());
    await deleteSteps['DELETE user'](api, { id: user.id });
    const res = await call(api, 'DELETE', ENDPOINTS.user(user.id));
    expect(res.status).toBe(404);
  });

  test('DELETE /api/users/{id} returns 404 for a missing user', async ({ api }) => {
    const res = await call(api, 'DELETE', ENDPOINTS.user(MISSING_ID));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  test('DELETE /api/users/{id} requires a token', async ({ anonApi }) => {
    const res = await call(anonApi, 'DELETE', ENDPOINTS.user(1));
    expect(res.status).toBe(401);
  });
});
