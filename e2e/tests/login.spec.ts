import { expect, test } from '@playwright/test';
import { ADMIN } from '../playwright.config.ts';
import { collectErrors } from './helpers.ts';

test.describe('Anmeldung und Rollen', () => {
  test('ohne Sitzung: Anmeldeseite; falsches Passwort → Fehlermeldung; richtig → App; Abmelden → wieder Anmeldeseite', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/test');
    await expect(page.getByTestId('login-page')).toBeVisible();
    await page.getByTestId('login-email').fill(ADMIN.email);
    await page.getByTestId('login-password').fill('falsches-passwort');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText('falsch');
    await page.getByTestId('login-password').fill(ADMIN.password);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('test-workflow')).toBeVisible();
    await expect(page.getByTestId('user-chip')).toContainText('Administrator');
    // Reload behält die Sitzung (httpOnly-Cookie)
    await page.reload();
    await expect(page.getByTestId('test-workflow')).toBeVisible();
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('login-page')).toBeVisible();
    // Cookie ist wirklich weg
    const me = await page.request.get('/api/auth/me');
    expect(me.status()).toBe(401);
    // 401-Antworten der Abmeldung/Anmeldeprüfung sind erwartet
    expect(errors.filter((e) => !/401|Unauthorized/.test(e))).toEqual([]);
  });

  test('Betrachter (viewer) darf keine Tests aufnehmen', async ({ page, request }) => {
    const login = await request.post('/api/auth/login', { data: ADMIN });
    expect(login.ok()).toBe(true);
    const email = `viewer-${Date.now()}@e2e.test`;
    const created = await request.post('/api/users', {
      data: { email, name: 'Vera Viewer', password: 'viewer-passwort-1', role: 'viewer' },
    });
    expect(created.status()).toBe(201);
    await page.goto('/test');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill('viewer-passwort-1');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('user-chip')).toContainText('Betrachter');
    await expect(page.getByText('darf keine Tests aufnehmen')).toBeVisible();
    await expect(page.getByTestId('test-workflow')).toHaveCount(0);
  });

  test('Lokaler Modus: ohne Server weiterarbeiten', async ({ page }) => {
    await page.goto('/test');
    await page.getByTestId('continue-local').click();
    await expect(page.getByTestId('test-workflow')).toBeVisible();
    await expect(page.getByTestId('local-chip')).toBeVisible();
    await expect(page.getByTestId('sync-badge')).toHaveCount(0);
  });
});
