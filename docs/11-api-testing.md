# 11. API testing

Besides testing the web pages in a browser, the framework can test **APIs** directly: it sends HTTP requests and checks the responses, with no browser involved. This guide explains how API tests are organised, how to write one for each HTTP method, and how to run them.

Related guides:
- [API server and Swagger](12-api-server-and-swagger.md): the demo API the tests run against, and its interactive documentation.
- [API flows](13-api-flows.md): linking requests from different methods into one end-to-end scenario.

## What is API testing?

A web application usually has two layers: the **pages** people see, and an **API** behind them that the pages call to read and save data. An API is a set of URLs (called **endpoints**) that accept requests and answer with data, usually in JSON.

Testing the API directly is:
- **Fast:** no browser to start, no page to render. Our 42 API tests run in about 3 seconds.
- **Stable:** no waiting for elements, animations or slow pages.
- **Precise:** you check the exact status code, headers and data.

Every request has a **method** that says what it wants to do:

| Method | Meaning | Typical success status | Example |
|---|---|---|---|
| `GET` | Read data | `200 OK` | `GET /api/users/1` → user 1 |
| `POST` | Create something new | `201 Created` | `POST /api/users` with a new user's data |
| `PUT` | Replace a whole record | `200 OK` | `PUT /api/users/1` with all of user 1's fields |
| `PATCH` | Change some fields of a record | `200 OK` | `PATCH /api/users/1` with `{ "status": "inactive" }` |
| `DELETE` | Remove a record | `204 No Content` | `DELETE /api/users/1` |
| `HEAD` | Like GET, but headers only, no body | `200 OK` | "Does user 1 exist?" |
| `OPTIONS` | Which methods a URL allows | `204 No Content` | `Allow: GET, POST, HEAD, OPTIONS` |

And every response has a **status code** that says how it went:

| Code | Meaning |
|---|---|
| `200` OK, `201` Created, `204` No Content | It worked |
| `400` Bad Request | The request was wrong (missing field, invalid value, broken JSON) |
| `401` Unauthorized | No valid login token was sent |
| `404` Not Found | The thing doesn't exist |
| `405` Method Not Allowed | That method isn't supported on that URL |
| `409` Conflict | It clashes with existing data (e.g. duplicate email) |
| `500` Internal Server Error | The server itself broke (always a bug) |

## Folder layout

API tests live in `tests/api/`, with **one folder per HTTP method**:

```
tests/api/
├── get/
│   ├── users.get.steps.js      Reusable GET requests ("steps")
│   └── users.get.spec.js       GET tests
├── post/
│   ├── users.post.steps.js     Reusable POST requests (create user, login)
│   ├── users.post.spec.js      POST /api/users tests
│   └── auth.post.spec.js       POST /api/auth/login tests
├── put/        users.put.steps.js,     users.put.spec.js
├── patch/      users.patch.steps.js,   users.patch.spec.js
├── delete/     users.delete.steps.js,  users.delete.spec.js
├── head/       users.head.steps.js,    users.head.spec.js
├── options/    users.options.steps.js, users.options.spec.js
├── flows/                      Tests that LINK several methods (see API flows guide)
│   ├── flow-runner.spec.js     Runs every *.flow.json file in this folder
│   ├── user-lifecycle.flow.json
│   ├── user-replace.flow.json
│   └── user-search.flow.spec.js  A flow written in code
└── support/                    Shared helpers (not tests)
    ├── fixtures.js             test, expect, api / anonApi, test data helpers
    ├── http.js                 call(): send a request and log it to the report
    └── steps.js                The registry of every step, used by flows
```

And in `utilities/`:

```
utilities/globalApi.js          API base URL, endpoints, login (like globalUrl.js for pages)
```

### Two kinds of files in each method folder

| File | Contains | Used by |
|---|---|---|
| `*.steps.js` | **Steps**: named, reusable requests that include their own checks, e.g. `'POST create user'` sends the request, checks for `201`, and returns the new user. | The tests in the same folder, other folders' tests (for setup), and **flows** |
| `*.spec.js` | **Tests** for that method: the success case plus error cases (missing fields, wrong id, no token…). | Playwright |

Steps are what make the **linking** feature work: because each request is a named step, a flow can say "POST create user, then GET user by id, then DELETE user" even though those steps live in three different folders. See [API flows](13-api-flows.md).

## How API tests run

- API tests run in their own Playwright project called **`api`**, not in Chrome or Edge, because they don't need a browser. You'll see `[api]` in the output and "api" as the project in reports.
- `browsers.json` doesn't apply to API tests.
- Before tests start, Playwright **starts the demo API server automatically** (`webServer` in `playwright.config.js`). If you already have it running (`npm run api:start`), it reuses it.
- Each test gets a fresh connection. Tests run in parallel, so each test creates its own data (unique names and emails) and never depends on another test.

## The building blocks

### `utilities/globalApi.js`: where the API is

```js
export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

export const API_CREDENTIALS = { username: 'admin', password: 'admin123' };   // overridable with env vars

export const ENDPOINTS = {
  health: '/api/health',
  login: '/api/auth/login',
  users: '/api/users',
  user: (id) => `/api/users/${id}`,
};
```

Tests never hard-code URLs: they use `ENDPOINTS.user(5)`, not `'/api/users/5'`. When an endpoint changes, you fix it once here.

### `support/fixtures.js`: what every API test gets

Always import `test` and `expect` from here in API tests (not from `@playwright/test`):

```js
import { test, expect, newUser, unique, MISSING_ID } from '../support/fixtures';
```

| Name | What it is |
|---|---|
| `api` (fixture) | A connection that is **already logged in**: every request sends `Authorization: Bearer <token>`. The login happens once per worker. |
| `anonApi` (fixture) | A connection with **no token**: for public endpoints, and for checking that protected ones return `401`. |
| `newUser(overrides?)` | Test data for a user with a **unique** name and email: `newUser({ role: 'admin' })`. |
| `unique()` | A short unique text, for building your own unique values. |
| `MISSING_ID` | An id no user will ever have (`999999`), for 404 tests. |

### `support/http.js`: `call()`

`call()` sends one request and returns what came back:

```js
const res = await call(api, 'GET', ENDPOINTS.user(1));
res.status    // 200
res.headers   // { 'content-type': 'application/json; charset=utf-8', ... } (names in lower case)
res.body      // the parsed JSON (or text, or '' when there's no body)
```

Options (third argument):

```js
await call(api, 'GET', ENDPOINTS.users, { params: { role: 'admin', limit: 5 } });   // query string ?role=admin&limit=5
await call(api, 'POST', ENDPOINTS.users, { data: { name: 'Dana', email: 'dana@example.com' } });  // JSON body
await call(api, 'GET', ENDPOINTS.users, { headers: { 'Accept-Language': 'en' } });  // extra headers
```

**Every call is recorded in the report.** In the dashboard, open a test and you'll see one entry per request, e.g. `POST /api/users → 201`, showing the request body, the response status, headers and body, and the time it took. When a test fails, this shows exactly what was sent and received.

## Writing a step

A step is an entry in a `*.steps.js` file: a name, and an async function `(api, params) => result`. Example from `post/users.post.steps.js`:

```js
export const postSteps = {
  /** Creates a user. Params: { name, email, role?, status? }. Returns the new user (with its id). */
  'POST create user': async (api, user) => {
    const res = await call(api, 'POST', ENDPOINTS.users, { data: user });
    expect(res.status, 'POST user should return 201').toBe(201);
    expect(res.body).toMatchObject({ name: user.name, email: user.email });
    expect(res.headers.location).toBe(ENDPOINTS.user(res.body.id));
    return res.body;
  },
};
```

Rules for steps:
1. **Name = method + what it does**, e.g. `'GET user by id'`, `'PATCH update user'`. Names must be unique across all folders (the registry stops with an error if two match).
2. **Check the expected status inside the step**, with a message (`expect(res.status, 'POST user should return 201')`), so a failure says which step broke.
3. **Return something useful**: the created or read record, so the caller (or a flow) can use its `id`.
4. **One step = one request.** Keep steps small; combine them in tests and flows.
5. **Document the params and the return value** in the comment above the step.

## Writing tests for each method

Tests follow the same pattern as UI tests: a `test(...)` with a descriptive, unique title. Name API tests after the **method and endpoint** plus what's checked: `'PATCH /api/users/{id} changes only the fields sent'`.

### GET: reading data

```js
test('GET /api/users filters by role', async ({ anonApi }) => {
  const list = await getSteps['GET users list'](anonApi, { role: 'admin' });
  expect(list.data.length).toBeGreaterThan(0);
  expect(list.data.every((u) => u.role === 'admin')).toBe(true);
});
```

### POST: creating data, and its error cases

```js
test('POST /api/users creates a user', async ({ api }) => {
  const data = newUser({ role: 'manager' });
  const user = await postSteps['POST create user'](api, data);
  expect(user).toMatchObject({ ...data, status: 'active' });
});

test('POST /api/users rejects a duplicate email', async ({ api }) => {
  const res = await call(api, 'POST', ENDPOINTS.users, { data: newUser({ email: 'alice@example.com' }) });
  expect(res.status).toBe(409);
});

test('POST /api/users requires a token', async ({ anonApi }) => {
  const res = await call(anonApi, 'POST', ENDPOINTS.users, { data: newUser() });
  expect(res.status).toBe(401);
});
```

For **success cases** use the step (it already checks the status). For **error cases** use `call()` directly and check the error status and message yourself.

### PUT / PATCH / DELETE: changing data you created

Tests that change data first **create their own user**, so they never modify shared data and can run in parallel:

```js
test.describe('PATCH', () => {
  let user;
  test.beforeEach(async ({ api }) => {
    user = await postSteps['POST create user'](api, newUser({ role: 'developer' }));
  });

  test('PATCH /api/users/{id} changes only the fields sent', async ({ api }) => {
    const updated = await patchSteps['PATCH update user'](api, { id: user.id, status: 'inactive' });
    expect(updated).toMatchObject({ name: user.name, role: 'developer', status: 'inactive' });
  });
});
```

Notice the setup uses a **POST step from another folder**: steps can be shared freely.

### HEAD: headers only

```js
test('HEAD /api/users returns the total in X-Total-Count', async ({ anonApi }) => {
  const res = await call(anonApi, 'HEAD', ENDPOINTS.users);
  expect(res.status).toBe(200);
  expect(res.body).toBe('');                                   // HEAD never has a body
  expect(Number(res.headers['x-total-count'])).toBeGreaterThanOrEqual(3);
});
```

### OPTIONS: allowed methods

```js
test('OPTIONS /api/users lists the allowed methods', async ({ anonApi }) => {
  const { allow } = await optionsSteps['OPTIONS allowed methods'](anonApi);
  expect(allow).toEqual(['GET', 'POST', 'HEAD', 'OPTIONS']);
});
```

### Useful assertions for APIs

```js
expect(res.status).toBe(200);
expect(res.body).toMatchObject({ name: 'Dana', role: 'tester' });     // these fields have these values (others ignored)
expect(res.body).toEqual(expect.objectContaining({ id: expect.any(Number) }));  // field types
expect(res.body.details).toContain('email is required and must be a valid email address');
expect(res.body.data).toHaveLength(1);
expect(res.headers['content-type']).toContain('application/json');
expect(Date.parse(res.body.createdAt)).not.toBeNaN();                  // a valid date
```

## Adding API tests for a new endpoint

Say the API gets a new `departments` resource:

1. **Add the endpoints** to `ENDPOINTS` in `utilities/globalApi.js`:
   ```js
   departments: '/api/departments',
   department: (id) => `/api/departments/${id}`,
   ```
2. **Add steps** in each method folder that needs them, in a new file per resource, e.g. `tests/api/post/departments.post.steps.js` exporting `departmentPostSteps` with `'POST create department'`.
3. **Register the new steps files** in `tests/api/support/steps.js` (import them and add them to `GROUPS`) so flows can use them.
4. **Write tests** next to them: `tests/api/post/departments.post.spec.js`.
5. **Run them:** `npx playwright test tests/api/post/departments.post.spec.js`.

## Running API tests

| Command | What it runs |
|---|---|
| `npm run test:api` | All API tests (the `api` project) |
| `.\suite.bat api` | The **API suite**: all API tests, with reports and the email |
| `npx playwright test tests/api/post` | One method folder |
| `npx playwright test tests/api/post/users.post.spec.js` | One file |
| `npx playwright test --project=api -g "duplicate email"` | Tests whose title contains the text |
| `npx playwright test --project=api -g "@flow"` | Only the flows |
| `npm test` | Everything: UI tests in their browsers **and** API tests |

The suite file is `test-plans/suites/api.json`:

```json
{
  "name": "API",
  "workers": 4,
  "retries": 0,
  "files": ["api"],
  "tests": []
}
```

`"files": ["api"]` is a **folder**: it includes every test under `tests/api/`. You can also pick folders like `"api/get"` or `"api/flows"`, or mix API and UI tests in one suite (`"files": ["example.spec.js", "api"]`).

## API results in reports and email

- **Dashboard:** "Results by browser / API" shows an `api` row, and an extra chart **API tests by method** (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, Flows). Click a bar to list that method's tests. Each test's detail panel shows every request and response.
- **Email:** the same "API tests by method" chart and table are included whenever the run contains API tests, and failed API tests appear in the *Failed tests* table with project `api`.

## Testing a different API

The tests run against the demo server by default. To run them against another deployment of the same API:

```powershell
$env:API_BASE_URL="https://qa.example.com"
$env:API_USERNAME="qa-user"; $env:API_PASSWORD="..."
npx playwright test --project=api
```

When `API_BASE_URL` is set, Playwright doesn't start the local demo server.
