// @ts-check

// Central place for everything API tests need: where the API is, its endpoints,
// and the login used to get a token. API tests import from here instead of
// hard-coding URLs (the same idea as globalUrl.js for UI tests).
//
// By default the tests run against the demo API in api-server/, which Playwright
// starts automatically. To test another deployment, set API_BASE_URL, e.g.
//   $env:API_BASE_URL="https://qa.example.com"; npx playwright test --project=api

export const API_PORT = Number(process.env.API_PORT ?? 3001);
export const API_BASE_URL = process.env.API_BASE_URL ?? `http://localhost:${API_PORT}`;

/** True when tests use the local demo server (so Playwright should start it). */
export const USES_LOCAL_API = !process.env.API_BASE_URL;

export const API_CREDENTIALS = {
  username: process.env.API_USERNAME ?? 'admin',
  password: process.env.API_PASSWORD ?? 'admin123',
};

export const ENDPOINTS = {
  health: '/api/health',
  login: '/api/auth/login',
  users: '/api/users',
  /** @param {number | string} id */
  user: (id) => `/api/users/${id}`,
};
