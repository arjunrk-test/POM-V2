// @ts-check
import { test, expect } from '@playwright/test';
import { URLS } from '../utilities/globalUrl';
import { ELEMENTS } from '../utilities/globalElements';

test('user can log in with valid credentials', async ({ page }) => {
  await page.goto(URLS.home);

  // Enter the username.
  await ELEMENTS.usernameInput(page).click();
  await ELEMENTS.usernameInput(page).fill('Admin');

  // Enter the password.
  await ELEMENTS.passwordInput(page).click();
  await ELEMENTS.passwordInput(page).fill('admin123');

  // Click the login button.
  await ELEMENTS.loginButton(page).click();

  // Login is successful if the browser lands on the dashboard URL.
  await expect(page).toHaveURL(URLS.dashboard);
});
