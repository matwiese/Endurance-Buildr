import { expect, test, type Page } from '@playwright/test';
import { collectErrors, perform, shot, toRecordStep } from '../tests/helpers.ts';
import { ADMIN } from '../playwright.prod.config.ts';

/** Meldet CSP-Verstöße (Chromium schreibt sie auch in die Konsole; das Ereignis macht sie eindeutig). */
async function trackCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('login-email').fill(ADMIN.email);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('user-chip')).toBeVisible();
}

test.describe('Produktionsbuild (vom Server ausgeliefert)', () => {
  test('Header, Manifest/Icons, Cache-Regeln', async ({ request }) => {
    const index = await request.get('/');
    expect(index.status()).toBe(200);
    expect(index.headers()['content-security-policy']).toContain("script-src 'self'");
    expect(index.headers()['x-frame-options']).toBe('DENY');
    expect(index.headers()['cache-control']).toBe('no-cache');
    const html = await index.text();
    const scripts = [...html.matchAll(/\/assets\/[^"']+\.js/g)].map((m) => m[0]);
    expect(scripts.length).toBeGreaterThan(0);
    const asset = scripts[0]!;
    const a = await request.get(asset);
    expect(a.headers()['cache-control']).toContain('immutable');

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.name).toBe('Buildr Force');
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons) {
      const r = await request.get(`/${icon.src}`);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()['content-type']).toContain(icon.type === 'image/png' ? 'image/png' : 'svg');
    }
    expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
    // Quellkarten sind nicht verlinkt
    expect(await (await request.get(asset)).text()).not.toContain('sourceMappingURL');
    // keine Herstellerdaten/Kennungen in den ausgelieferten Demo-Aufnahmen (Chunk-Namen stehen in der Vorlade-Liste der App)
    let demoPath: string | null = null;
    for (const src of scripts) {
      const m = /demo-[\w.-]+\.js/.exec(await (await request.get(src)).text());
      if (m) demoPath = `assets/${m[0]}`;
    }
    expect(demoPath, 'Demo-Chunk in der App referenziert').not.toBeNull();
    const demoText = await (await request.get(`/${demoPath}`)).text();
    expect(demoText).toContain('Buildr Demo Recording');
    expect(demoText).not.toMatch(/AthleteId|ForceDecks|FDL2/);
  });

  test('Anmelden, Workflow mit Simulator, Hub/Gruppentest/Einstellungen (Lazy-Chunks) – ohne CSP-Verstöße und Fehler', async ({
    page,
  }) => {
    // der erste /api/auth/me ohne Sitzung antwortet erwartungsgemäß 401 (Browser meldet das in der Konsole)
    const errors = collectErrors(page);
    const csp = await trackCsp(page);
    await login(page);
    await toRecordStep(page, { speed: 5, type: 'cmj' });
    await page.getByTestId('record-start').click();
    await perform(page, 'cmj');
    await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 60_000 });
    await shot(page, 'prod-01-live-result');
    for (const [nav, marker] of [
      ['nav-hub', 'hub'],
      ['nav-session', 'sessions-page'],
    ] as const) {
      await page.getByTestId(nav).click();
      await expect(page.getByTestId(marker)).toBeVisible();
    }
    await page.getByRole('link', { name: 'Einstellungen' }).click();
    await expect(page.getByRole('heading', { name: /Einstellungen/ }).first()).toBeVisible();
    expect(await csp()).toEqual([]);
    const real = errors.filter((e) => !/status of 401/.test(e));
    expect(real, real.join('\n')).toEqual([]);
  });

  test('Service Worker: App startet nach Neuladen ohne Netz (Offline-Shell, zwischengespeicherte Sitzung)', async ({
    page,
    context,
  }) => {
    const csp = await trackCsp(page);
    await login(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // ab jetzt kontrolliert der Service Worker die Seite
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 })
      .toBe(true);
    await expect(page.getByTestId('user-chip')).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('user-chip')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('connect-button')).toBeVisible();
    // Lazy-Chunk (Hub) kommt aus dem Cache
    await page.getByTestId('nav-hub').click();
    await expect(page.getByTestId('hub')).toBeVisible();
    // Aufnahme ist offline möglich (Simulator)
    await toRecordStep(page, { speed: 5, type: 'cmj' });
    await shot(page, 'prod-02-offline');
    await context.setOffline(false);
    expect(await csp()).toEqual([]);
  });

  test('Wiedergabe der mitgelieferten Demo-Aufnahme (bereinigte CSV) verbindet und liefert Ergebnisse', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await login(page);
    await page.goto('/test');
    await page.getByTestId('source-replay').click();
    await page.getByTestId('connect-button').click();
    await expect(page.getByTestId('status-connection')).toContainText('Verbunden', { timeout: 30_000 });
    await shot(page, 'prod-03-replay');
    const real = errors.filter((e) => !/status of 401/.test(e));
    expect(real, real.join('\n')).toEqual([]);
  });
});
