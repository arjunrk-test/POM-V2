// @ts-check

// Central place for every element (locator) used in the tests.
// Each entry takes the Playwright `page` and returns a locator,
// so tests can do: await ELEMENTS.loginButton(page).click();

/** @typedef {import('@playwright/test').Page} Page */

export const ELEMENTS = {
  // Login page
  /** @param {Page} page */
  usernameInput: (page) => page.locator("input[name='username']"),

  /** @param {Page} page */
  passwordInput: (page) => page.locator("input[name='password']"),

  /** @param {Page} page */
  loginButton: (page) => page.locator('button.orangehrm-login-button'),
};
