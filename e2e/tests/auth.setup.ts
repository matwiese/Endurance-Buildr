import { expect, test as setup } from '@playwright/test';
import { ADMIN } from '../playwright.config.ts';

/** Einmal anmelden, Sitzung (Cookie) für alle weiteren Tests speichern. */
setup('Admin anmelden', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-email').fill(ADMIN.email);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('user-chip')).toContainText('Administrator');
  await page.context().storageState({ path: '.artifacts/admin.json' });
});
