# 12. The demo API server and Swagger

The framework includes a small **demo REST API** so you can learn and practise API testing without depending on another team's server. Its documentation is published as a **Swagger** page you can open in your browser and use to try every request.

## What is Swagger / OpenAPI?

- **OpenAPI** is a standard file format for describing an API: every endpoint, which methods it supports, what parameters and request body it expects, which responses it can return, and what the data looks like. Ours is `api-server/openapi.json`.
- **Swagger UI** is a web page that reads an OpenAPI file and turns it into interactive documentation: a list of all endpoints you can expand, with examples, and a **Try it out** button that sends a real request and shows the real response.

Why it matters for testers: the OpenAPI file is the **contract**. It tells you what the API promises (e.g. "POST /api/users returns 201 with the new user, or 409 if the email exists"), and your tests check that the API keeps those promises. When you get access to a new API at work, look for its Swagger page first (often at `/docs`, `/swagger` or `/swagger-ui`).

## Starting the server

Playwright starts the server automatically when you run tests, so you only start it yourself when you want to explore it:

```powershell
npm run api:start
```

```
Demo Users API running at http://localhost:3001
Swagger UI:   http://localhost:3001/docs
```

Leave that terminal open (the server runs until you press **Ctrl+C**). While it's running, `npx playwright test` reuses it instead of starting another one.

| URL | What it is |
|---|---|
| <http://localhost:3001/docs> | **Swagger UI**: interactive documentation |
| <http://localhost:3001/openapi.json> | The OpenAPI file itself |
| <http://localhost:3001/api/health> | Health check: `{ "status": "ok", ... }` |
| <http://localhost:3001/> | A short index of the above |

To use another port: `$env:API_PORT=4000; npm run api:start` (and set the same `API_PORT` when running the tests).

## Using the Swagger page

Open <http://localhost:3001/docs>.

1. **Read the introduction** at the top: the method table, how login works, and that data resets on restart.
2. **Expand an endpoint** (click its coloured bar, e.g. the blue **GET /api/users**). You'll see its parameters, the request body format with an example, and every possible response with its status code and an example.
3. **Try a read:** click **Try it out** → (optionally fill parameters, e.g. `role` = `admin`) → **Execute**. Below you'll see:
   - the **curl** command for the same request (handy for bug reports),
   - the **Request URL**,
   - the **Server response**: status code, body and headers.
4. **Log in for write requests:**
   1. Expand **POST /api/auth/login** → **Try it out** → keep the example body (`admin` / `admin123`) → **Execute**.
   2. Copy the `token` value from the response (without the quotes).
   3. Click **Authorize** (top right of the endpoint list), paste the token, click **Authorize**, then **Close**.
   4. Now POST, PUT, PATCH and DELETE requests send the token automatically. The padlock icons on those endpoints appear closed.
5. **Schemas** at the bottom describe each data shape (`User`, `UserInput`, `Error`…) with every field, its type and its allowed values.

> Anything you do in Swagger changes the server's data (until it restarts). Tests create their own users, so this won't break them.

## The API at a glance

**Users** have: `id` (number, set by the server), `name` (2–100 characters), `email` (valid and unique), `role` (`admin`, `manager`, `developer` or `tester`; default `tester`), `status` (`active` or `inactive`; default `active`), `createdAt`, `updatedAt`.

Three users exist at start-up: **1** Alice Admin (admin), **2** Bob Builder (developer), **3** Carol Checker (tester, inactive). Tests may read them but never change them.

| Method | Endpoint | Login? | Success | Errors |
|---|---|---|---|---|
| GET | `/api/health` | No | 200 | |
| POST | `/api/auth/login` | No | 200 `{ token, tokenType, expiresIn }` | 400 missing fields, 401 wrong login |
| GET | `/api/users` | No | 200 `{ data, total, page, limit }` + `X-Total-Count` header | 400 bad `role`/`status` |
| HEAD | `/api/users` | No | 200, `X-Total-Count` header, no body | |
| POST | `/api/users` | **Yes** | 201 user + `Location` header | 400 invalid, 401, 409 email taken |
| OPTIONS | `/api/users` | No | 204, `Allow: GET, POST, HEAD, OPTIONS` | |
| GET | `/api/users/{id}` | No | 200 user + `Last-Modified` header | 400 bad id, 404 |
| HEAD | `/api/users/{id}` | No | 200, no body | 404 |
| PUT | `/api/users/{id}` | **Yes** | 200 user | 400, 401, 404, 409 |
| PATCH | `/api/users/{id}` | **Yes** | 200 user | 400, 401, 404, 409 |
| DELETE | `/api/users/{id}` | **Yes** | 204, no body | 401, 404 |
| OPTIONS | `/api/users/{id}` | No | 204, `Allow: GET, PUT, PATCH, DELETE, HEAD, OPTIONS` | 404 |
| any other | e.g. `DELETE /api/users` | | | 405 with an `Allow` header |

**List parameters** for `GET /api/users`: `role`, `status`, `search` (text in name or email), `page` (from 1), `limit` (1–100, default 10).

**PUT vs PATCH:** PUT *replaces* the user: `name` and `email` are required, and `role`/`status` go back to their defaults if you leave them out. PATCH *changes* only the fields you send.

**Errors** always look like this:

```json
{
  "error": "ValidationError",
  "message": "The request body is invalid",
  "details": ["email is required and must be a valid email address"]
}
```

`details` appears only on validation errors and lists every problem found.

**Login tokens** are valid for one hour and are forgotten when the server restarts.

## Trying requests without Swagger

From PowerShell:

```powershell
Invoke-RestMethod http://localhost:3001/api/users/1

$login = Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/auth/login `
  -ContentType 'application/json' -Body '{"username":"admin","password":"admin123"}'
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/users `
  -Headers @{ Authorization = "Bearer $($login.token)" } `
  -ContentType 'application/json' -Body '{"name":"Dana Doe","email":"dana@example.com"}'
```

Or import `http://localhost:3001/openapi.json` into **Postman** (Import → Link) to get every request ready-made.

## Changing the API

The server is `api-server/server.js`, plain Node.js with no extra packages:
- Routes are in `handleUsers` (for `/api/users`), `handleUser` (for `/api/users/{id}`) and `handleLogin`.
- Validation rules are in `validateUser`.
- The starting users are the three `addUser(...)` calls near the top.

**If you change the API, update `api-server/openapi.json` too**, so the Swagger page keeps telling the truth, and add or update tests in `tests/api/`. You can check the spec at <https://editor.swagger.io> (File → Import file) to catch mistakes.
