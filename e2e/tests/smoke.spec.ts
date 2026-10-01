import { expect, test } from '@playwright/test';

test('App lädt und zeigt den Verbinden-Schritt', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/test');
  await expect(page.getByTestId('test-workflow')).toBeVisible();
  await expect(page.getByTestId('step-connect')).toBeVisible();
  await page.screenshot({ path: '.artifacts/shot-connect.png', fullPage: true });
  expect(errors).toEqual([]);
});
