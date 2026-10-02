// @ts-check
import { test, expect } from '../support/fixtures';
import { call } from '../support/http';
import { optionsSteps } from './users.options.steps';
import { ENDPOINTS } from '../../../utilities/globalApi';

test.describe('OPTIONS', () => {
  test('OPTIONS /api/users lists the allowed methods', async ({ anonApi }) => {
    const { allow } = await optionsSteps['OPTIONS allowed methods'](anonApi);
    expect(allow).toEqual(['GET', 'POST', 'HEAD', 'OPTIONS']);
  });

  test('OPTIONS /api/users/{id} lists the allowed methods', async ({ anonApi }) => {
    const { allow } = await optionsSteps['OPTIONS allowed methods'](anonApi, { id: 1 });
    expect(allow).toEqual(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  });

  test('a method that is not allowed returns 405 with an Allow header', async ({ api }) => {
    // DELETE on the whole collection is not supported.
    const res = await call(api, 'DELETE', ENDPOINTS.users);
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, POST, HEAD, OPTIONS');
    expect(res.body.error).toBe('MethodNotAllowed');
  });
});
