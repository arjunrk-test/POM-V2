// Demo REST API used to learn and practise API test automation.
//
// It manages "users" and supports every common HTTP method:
//   GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
// Data is kept in memory and reset every time the server starts.
//
// Start it:   npm run api:start           (Playwright also starts it automatically for tests)
// Swagger UI: http://localhost:3001/docs  (interactive documentation)
// Spec:       http://localhost:3001/openapi.json
//
// Built on Node's own http module, so it needs no extra packages.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.API_PORT ?? 3001);
const USERNAME = process.env.API_USERNAME ?? 'admin';
const PASSWORD = process.env.API_PASSWORD ?? 'admin123';
const TOKEN_TTL_SECONDS = 3600;

const ROLES = ['admin', 'manager', 'developer', 'tester'];
const STATUSES = ['active', 'inactive'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SPEC_FILE = path.join(__dirname, 'openapi.json');
const SWAGGER_DIR = require('swagger-ui-dist').getAbsoluteFSPath();

// ---------- in-memory data ----------
let nextId = 1;
/** @type {Map<number, object>} */
const users = new Map();
/** @type {Map<string, number>} token -> expiry time (ms) */
const tokens = new Map();

function addUser({ name, email, role = 'tester', status = 'active' }) {
  const now = new Date().toISOString();
  const user = { id: nextId++, name, email, role, status, createdAt: now, updatedAt: now };
  users.set(user.id, user);
  return user;
}
addUser({ name: 'Alice Admin', email: 'alice@example.com', role: 'admin' });
addUser({ name: 'Bob Builder', email: 'bob@example.com', role: 'developer' });
addUser({ name: 'Carol Checker', email: 'carol@example.com', role: 'tester', status: 'inactive' });

// ---------- helpers ----------
class ApiError extends Error {
  constructor(status, error, message, details) {
    super(message);
    Object.assign(this, { status, error, details });
  }
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    ...(payload ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  });
  // HEAD responses carry headers only.
  res.end(res.req.method === 'HEAD' ? undefined : payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new ApiError(413, 'PayloadTooLarge', 'Request body is larger than 1 MB'));
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        const body = JSON.parse(raw);
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          return reject(new ApiError(400, 'BadRequest', 'Request body must be a JSON object'));
        }
        resolve(body);
      } catch {
        reject(new ApiError(400, 'BadRequest', 'Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function requireAuth(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expiry = tokens.get(token);
  if (!token || !expiry || expiry < Date.now()) {
    throw new ApiError(401, 'Unauthorized', 'A valid Bearer token is required. Get one from POST /api/auth/login.');
  }
}

/**
 * Validates user fields. `partial` (PATCH) allows any subset; otherwise name and email are required.
 * Returns only the known fields.
 */
function validateUser(body, { partial }) {
  const allowed = ['name', 'email', 'role', 'status'];
  const details = [];
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k) && !['id', 'createdAt', 'updatedAt'].includes(k));
  if (unknown.length) details.push(`Unknown field(s): ${unknown.join(', ')}`);
  if (partial && !allowed.some((k) => k in body)) details.push(`Provide at least one of: ${allowed.join(', ')}`);

  const check = (key, valid, message) => {
    if (key in body ? !valid(body[key]) : !partial && ['name', 'email'].includes(key)) details.push(message);
  };
  check('name', (v) => typeof v === 'string' && v.trim().length >= 2 && v.length <= 100, 'name is required and must be 2-100 characters');
  check('email', (v) => typeof v === 'string' && EMAIL_PATTERN.test(v), 'email is required and must be a valid email address');
  check('role', (v) => ROLES.includes(v), `role must be one of: ${ROLES.join(', ')}`);
  check('status', (v) => STATUSES.includes(v), `status must be one of: ${STATUSES.join(', ')}`);

  if (details.length) throw new ApiError(400, 'ValidationError', 'The request body is invalid', details);
  return Object.fromEntries(allowed.filter((k) => k in body).map((k) => [k, typeof body[k] === 'string' ? body[k].trim() : body[k]]));
}

function assertEmailFree(email, exceptId) {
  for (const user of users.values()) {
    if (user.id !== exceptId && user.email.toLowerCase() === email.toLowerCase()) {
      throw new ApiError(409, 'Conflict', `A user with email ${email} already exists`);
    }
  }
}

function findUser(idText) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'BadRequest', 'User id must be a positive whole number');
  const user = users.get(id);
  if (!user) throw new ApiError(404, 'NotFound', `User ${id} not found`);
  return user;
}

function methodNotAllowed(allow) {
  const error = new ApiError(405, 'MethodNotAllowed', `Method not allowed. Allowed: ${allow}`);
  error.headers = { Allow: allow };
  return error;
}

// ---------- routes ----------
const USERS_ALLOW = 'GET, POST, HEAD, OPTIONS';
const USER_ALLOW = 'GET, PUT, PATCH, DELETE, HEAD, OPTIONS';

async function handleUsers(req, res, url) {
  switch (req.method) {
    case 'GET':
    case 'HEAD': {
      const role = url.searchParams.get('role');
      const status = url.searchParams.get('status');
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 10) || 10));
      if (role && !ROLES.includes(role)) throw new ApiError(400, 'BadRequest', `role must be one of: ${ROLES.join(', ')}`);
      if (status && !STATUSES.includes(status)) throw new ApiError(400, 'BadRequest', `status must be one of: ${STATUSES.join(', ')}`);

      const matches = [...users.values()].filter((u) =>
        (!role || u.role === role) &&
        (!status || u.status === status) &&
        (!search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)));
      const data = matches.slice((page - 1) * limit, page * limit);
      return send(res, 200, { data, total: matches.length, page, limit }, { 'X-Total-Count': String(matches.length) });
    }
    case 'POST': {
      requireAuth(req);
      const fields = validateUser(await readBody(req), { partial: false });
      assertEmailFree(fields.email);
      const user = addUser(fields);
      return send(res, 201, user, { Location: `/api/users/${user.id}` });
    }
    case 'OPTIONS':
      return send(res, 204, undefined, { Allow: USERS_ALLOW });
    default:
      throw methodNotAllowed(USERS_ALLOW);
  }
}

async function handleUser(req, res, idText) {
  switch (req.method) {
    case 'GET':
    case 'HEAD': {
      const user = findUser(idText);
      return send(res, 200, user, { 'Last-Modified': new Date(user.updatedAt).toUTCString() });
    }
    case 'PUT': {
      requireAuth(req);
      const user = findUser(idText);
      const fields = validateUser(await readBody(req), { partial: false });
      assertEmailFree(fields.email, user.id);
      // PUT replaces the whole resource: fields not sent go back to their defaults.
      Object.assign(user, { role: 'tester', status: 'active' }, fields, { updatedAt: new Date().toISOString() });
      return send(res, 200, user);
    }
    case 'PATCH': {
      requireAuth(req);
      const user = findUser(idText);
      const fields = validateUser(await readBody(req), { partial: true });
      if (fields.email) assertEmailFree(fields.email, user.id);
      // PATCH changes only the fields that were sent.
      Object.assign(user, fields, { updatedAt: new Date().toISOString() });
      return send(res, 200, user);
    }
    case 'DELETE': {
      requireAuth(req);
      const user = findUser(idText);
      users.delete(user.id);
      return send(res, 204);
    }
    case 'OPTIONS':
      findUser(idText);
      return send(res, 204, undefined, { Allow: USER_ALLOW });
    default:
      throw methodNotAllowed(USER_ALLOW);
  }
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') throw methodNotAllowed('POST');
  const { username, password } = await readBody(req);
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new ApiError(400, 'ValidationError', 'username and password are required', ['username and password must be strings']);
  }
  if (username !== USERNAME || password !== PASSWORD) {
    throw new ApiError(401, 'Unauthorized', 'Invalid username or password');
  }
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL_SECONDS * 1000);
  return send(res, 200, { token, tokenType: 'Bearer', expiresIn: TOKEN_TTL_SECONDS });
}

const startedAt = Date.now();

function serveStatic(res, file, type) {
  fs.readFile(file, (err, content) => {
    if (err) return send(res, 404, { error: 'NotFound', message: 'File not found' });
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length });
    res.end(content);
  });
}

const SWAGGER_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Demo Users API: Swagger UI</title>
<link rel="stylesheet" href="/docs/swagger-ui.css"><link rel="icon" href="/docs/favicon-32x32.png">
</head><body><div id="swagger-ui"></div>
<script src="/docs/swagger-ui-bundle.js"></script><script src="/docs/swagger-ui-standalone-preset.js"></script>
<script>
window.ui = SwaggerUIBundle({
  url: '/openapi.json', dom_id: '#swagger-ui', deepLinking: true, persistAuthorization: true,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'StandaloneLayout',
});
</script></body></html>`;

const STATIC_TYPES = { '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.map': 'application/json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const route = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (route === '/') return send(res, 200, { name: 'Demo Users API', docs: '/docs', spec: '/openapi.json', health: '/api/health' });
    if (route === '/docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(SWAGGER_PAGE);
    }
    if (route.startsWith('/docs/')) {
      const name = path.basename(route);
      return serveStatic(res, path.join(SWAGGER_DIR, name), STATIC_TYPES[path.extname(name)] ?? 'application/octet-stream');
    }
    if (route === '/openapi.json') return serveStatic(res, SPEC_FILE, 'application/json; charset=utf-8');
    if (route === '/api/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw methodNotAllowed('GET, HEAD');
      return send(res, 200, { status: 'ok', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), users: users.size });
    }
    if (route === '/api/auth/login') return await handleLogin(req, res);
    if (route === '/api/users') return await handleUsers(req, res, url);
    const match = route.match(/^\/api\/users\/([^/]+)$/);
    if (match) return await handleUser(req, res, decodeURIComponent(match[1]));
    throw new ApiError(404, 'NotFound', `No route for ${req.method} ${url.pathname}`);
  } catch (error) {
    if (error instanceof ApiError) {
      return send(res, error.status, { error: error.error, message: error.message, ...(error.details ? { details: error.details } : {}) }, error.headers);
    }
    console.error(error);
    return send(res, 500, { error: 'InternalServerError', message: 'Something went wrong' });
  }
});

server.listen(PORT, () => {
  console.log(`Demo Users API running at http://localhost:${PORT}`);
  console.log(`Swagger UI:   http://localhost:${PORT}/docs`);
});
