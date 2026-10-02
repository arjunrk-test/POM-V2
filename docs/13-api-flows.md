# 13. API flows: linking tests across methods

Real scenarios use several methods in a row. To check "a user can be created and deleted" you need:

1. **POST** to create the user,
2. **GET** to check it was saved,
3. **DELETE** to delete it,
4. **GET** again to confirm it's gone.

Each method has its own folder in `tests/api/`, but a scenario like this crosses folders. **Flows** link them: a flow is one test made of named **steps** taken from any method folder, run in order, passing data (like the new user's `id`) from one step to the next.

There are two ways to write a flow:

| | **JSON flow** (`*.flow.json`) | **Code flow** (`*.flow.spec.js`) |
|---|---|---|
| Written as | A list of steps in a JSON file | A normal Playwright test in JavaScript |
| Good for | Straight sequences: create → check → change → delete | Loops, conditions, calculations, many records |
| Needs coding? | No | Yes |
| Example | `tests/api/flows/user-lifecycle.flow.json` | `tests/api/flows/user-search.flow.spec.js` |

Both use the same steps from the method folders, and both show each step separately in the reports.

## How linking works

```
tests/api/get/users.get.steps.js        'GET user by id', 'GET user not found', 'GET users list'
tests/api/post/users.post.steps.js      'POST create user', 'POST login'
tests/api/put/users.put.steps.js        'PUT replace user'
tests/api/patch/users.patch.steps.js    'PATCH update user'
tests/api/delete/users.delete.steps.js  'DELETE user'
tests/api/head/users.head.steps.js      'HEAD user exists', 'HEAD user missing'
tests/api/options/users.options.steps.js 'OPTIONS allowed methods'
                 │
                 ▼
tests/api/support/steps.js   ← the registry: every step above, by name
                 │
                 ▼
tests/api/flows/flow-runner.spec.js   ← reads each *.flow.json and runs its steps by name
```

Each step already contains its own checks (e.g. `'DELETE user'` checks for `204`), so a flow only says **what** to do and **with which data**.

## Available steps

| Step name | Params (`with`) | Checks | Returns |
|---|---|---|---|
| `GET user by id` | `id` | 200, the user has that id | the user |
| `GET user not found` | `id` | 404 | the error body |
| `GET users list` | any of `role`, `status`, `search`, `page`, `limit` | 200, `X-Total-Count` matches | `{ data, total, page, limit }` |
| `POST create user` | `name`, `email`, optional `role`, `status` | 201, `Location` header | the new user |
| `POST login` | `username`, `password` | 200, a token | `{ token, tokenType, expiresIn }` |
| `PUT replace user` | `id`, `name`, `email`, optional `role`, `status` | 200, fields saved | the user |
| `PATCH update user` | `id` + the fields to change | 200, fields saved | the user |
| `DELETE user` | `id` | 204, empty body | nothing |
| `HEAD user exists` | `id` | 200, empty body | the response headers |
| `HEAD user missing` | `id` | 404 | the response headers |
| `OPTIONS allowed methods` | optional `id` (omit for `/api/users`) | 204, an `Allow` header | `{ allow: [...] }` |

If you use a name that doesn't exist, the flow fails with the full list of available steps.

## JSON flows

Every `*.flow.json` file in `tests/api/flows/` becomes one test automatically. There's nothing to register.

### Example: `user-lifecycle.flow.json`

```json
{
  "name": "Flow: user lifecycle (create, read, update, delete)",
  "description": "Creates a user, reads it back, changes its status, checks the change, then deletes it and confirms it is gone.",
  "tags": ["@crud"],
  "steps": [
    {
      "step": "POST create user",
      "with": { "name": "Flow User {{unique}}", "email": "flow.{{unique}}@example.com", "role": "developer" },
      "save": { "userId": "id", "email": "email" }
    },
    {
      "step": "GET user by id",
      "with": { "id": "{{userId}}" },
      "expect": { "email": "{{email}}", "role": "developer", "status": "active" }
    },
    { "step": "PATCH update user", "with": { "id": "{{userId}}", "status": "inactive" } },
    { "step": "GET user by id", "with": { "id": "{{userId}}" }, "expect": { "status": "inactive" } },
    { "step": "HEAD user exists", "with": { "id": "{{userId}}" } },
    { "step": "DELETE user", "with": { "id": "{{userId}}" } },
    { "step": "GET user not found", "with": { "id": "{{userId}}" } },
    { "step": "HEAD user missing", "with": { "id": "{{userId}}" } }
  ]
}
```

What happens when it runs:
1. **POST create user** creates a user. `save` stores the returned user's `id` as `{{userId}}` and its `email` as `{{email}}`.
2. **GET user by id** reads user `{{userId}}`; `expect` checks the result has that email, role and status.
3. **PATCH update user** sets the status to inactive (the step itself checks the change was saved).
4. **GET user by id** confirms the new status.
5. **HEAD user exists** confirms the user exists with a HEAD request.
6. **DELETE user** deletes the user.
7. **GET user not found** confirms GET now returns 404.
8. **HEAD user missing** confirms HEAD now returns 404.

If any step fails, the flow stops there and the report shows which numbered step failed and why.

### Flow file reference

**Top level:**

| Field | Required | Meaning |
|---|---|---|
| `name` | Yes (else the file name is used) | The test title. Make it unique; start it with `Flow:` so flows are easy to spot. |
| `description` | No | What the flow checks. Documentation only. |
| `tags` | No | Extra tags, e.g. `["@crud", "@smoke"]`. `@flow` is always added. |
| `steps` | Yes | The steps, in order. |

**Each step:**

| Field | Required | Meaning |
|---|---|---|
| `step` | Yes | A step name from the table above. |
| `with` | Depends on the step | The step's parameters. May contain `{{variables}}`. |
| `save` | No | Save values from the step's result for later steps: `{ "variableName": "path" }`. The path is a field name (`"id"`) or a dotted path (`"data.0.email"`). `""` saves the whole result. |
| `expect` | No | The result must **contain** these values (other fields are ignored). May contain `{{variables}}`. |
| `auth` | No | `false` sends the request **without** a login token. |

### Variables

Write `{{name}}` anywhere inside `with` or `expect`:

| Variable | Value |
|---|---|
| `{{unique}}` | A random text, **the same throughout one flow run**, different every run. Use it to make names and emails unique: `"flow.{{unique}}@example.com"`. |
| anything saved with `save` | e.g. `{{userId}}` after `"save": { "userId": "id" }` |

- `"{{userId}}"` on its own keeps the original type (the number `7`), while `"User {{userId}}"` becomes text (`"User 7"`).
- Using a variable that hasn't been saved yet fails the step with `Unknown variable {{name}}. Known variables: ...`.

### Writing a new JSON flow

1. Create `tests/api/flows/<something>.flow.json` (the name **must end in `.flow.json`**).
2. Start from an example: copy `user-lifecycle.flow.json` and change the steps.
3. Check it's picked up: `npx playwright test --project=api --list -g "Flow:"`.
4. Run it: `npx playwright test --project=api -g "<your flow name>"`.

A JSON syntax error doesn't stop the other tests: a test named `flow file <name> is valid` fails with the parser's message.

## Code flows

When a flow needs logic that JSON can't express, write it as a normal test that calls the steps directly, and wrap each part in `test.step` so it reads well in the reports. From `user-search.flow.spec.js` (shortened):

```js
import { test, expect, newUser, unique } from '../support/fixtures';
import { postSteps } from '../post/users.post.steps';
import { getSteps } from '../get/users.get.steps';
import { deleteSteps } from '../delete/users.delete.steps';

test('Flow: created users can be searched, and disappear after delete', { tag: ['@flow', '@search'] }, async ({ api }) => {
  const marker = unique();
  const created = [];

  await test.step('1. POST create two users that share a name', async () => {
    for (const role of ['admin', 'tester']) {
      created.push(await postSteps['POST create user'](api, newUser({ name: `Searchable ${marker} ${role}`, role })));
    }
  });

  await test.step('2. GET search finds both users', async () => {
    const list = await getSteps['GET users list'](api, { search: marker });
    expect(list.total).toBe(2);
  });

  await test.step('3. DELETE both users', async () => {
    for (const user of created) await deleteSteps['DELETE user'](api, { id: user.id });
  });

  await test.step('4. GET search finds nothing', async () => {
    const list = await getSteps['GET users list'](api, { search: marker });
    expect(list.total).toBe(0);
  });
});
```

Name code flow files `*.flow.spec.js` so they're recognisable, and tag them `@flow` so `-g "@flow"` finds them.

## Adding a new step for flows

1. Add it to the right method folder's `*.steps.js` file (see [writing a step](11-api-testing.md#writing-a-step)).
2. If it's in a **new** steps file, register the file in `tests/api/support/steps.js`:
   ```js
   import { departmentPostSteps } from '../post/departments.post.steps';
   const GROUPS = [getSteps, postSteps, /* ... */ departmentPostSteps];
   ```
3. Use its name in any flow.

## Running flows

```powershell
npx playwright test --project=api -g "@flow"          # all flows (JSON and code)
npx playwright test tests/api/flows                  # same, by folder
npx playwright test --project=api -g "user lifecycle" # one flow
```

Flows are included in `.\suite.bat api` and `npm run test:api`. To make a flows-only suite, create `test-plans/suites/api-flows.json`:

```json
{ "name": "API flows", "files": ["api/flows"] }
```

## Flows in the reports

- **Dashboard:** open a flow in *All tests* to see each numbered step (`1. POST create user`, `2. GET user by id`, …) with its duration, the checks inside it, and every request and response (e.g. `POST /api/users → 201`). The failing step is marked in red.
- **API tests by method** (dashboard and email) has a **Flows** row.

## Tips

- **Clean up after yourself:** end flows that create data with a `DELETE user` step, so the data doesn't pile up.
- **Keep flows focused:** one business scenario per flow. Detailed checks of a single endpoint (every validation error, etc.) belong in that method's spec file.
- **Use `{{unique}}`** in every name and email you create; tests run in parallel and emails must be unique.
