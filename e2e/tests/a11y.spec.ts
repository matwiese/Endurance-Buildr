import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { perform, toRecordStep } from './helpers.ts';
import { seedGroupsAndProfiles, uploadSyntheticTest } from './seed.ts';

const stamp = Date.now().toString(36);

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.getByRole('button', { name: 'Theme' }).waitFor();
  const current = await page.evaluate(() => document.documentElement.dataset.theme);
  if (current !== theme) await page.getByRole('button', { name: 'Theme' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
}

async function scan(page: Page, name: string): Promise<void> {
  // Animationen/Übergänge abwarten, damit Kontraste nicht mitten im Übergang gemessen werden
  await page.waitForTimeout(400);
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const lines = res.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes
        .slice(0, 4)
        .map(
          (n) =>
            `    ${n.target.join(' ')} → ${(n.failureSummary ?? '').split('\n').slice(0, 2).join(' | ')}`,
        )
        .join('\n'),
  );
  expect.soft(lines, `${name}\n${lines.join('\n')}`).toEqual([]);
}

test.describe('Barrierefreiheit (axe, WCAG 2.2 AA) – hell und dunkel', () => {
  test('Hauptseiten, Hub und Gruppentest', async ({ page }) => {
    test.setTimeout(240_000);
    const req = page.request;
    const { profiles } = await seedGroupsAndProfiles(req, stamp, [
      { group: 'Barrierefrei', people: [{ name: 'Lea', sex: 'f', dob: '2001-04-04', sport: 'Judo' }] },
    ]);
    const lea = profiles[0]!;
    const testId = await uploadSyntheticTest(req, {
      profileId: lea.id,
      createdAt: new Date().toISOString(),
      jumpHeightM: 0.31,
      seed: 3,
    });

    const pages: Array<[string, (p: Page) => Promise<void>]> = [
      ['Test: Verbinden', async (p) => void (await p.goto('/test'))],
      ['Einstellungen', async (p) => void (await p.goto('/settings'))],
      ['Hub: Athleten', async (p) => void (await p.goto('/hub/athletes'))],
      ['Hub: Athletenprofil', async (p) => void (await p.goto(`/hub/athletes/${lea.id}`))],
      ['Hub: Tests', async (p) => void (await p.goto('/hub/tests'))],
      ['Hub: Testdetail', async (p) => void (await p.goto(`/hub/tests/${testId}`))],
      ['Hub: Berichte', async (p) => void (await p.goto('/hub/reports'))],
      ['Hub: Normwerte', async (p) => void (await p.goto('/hub/norms'))],
      ['Hub: Gruppen', async (p) => void (await p.goto('/hub/groups'))],
      ['Hub: Tags', async (p) => void (await p.goto('/hub/tags'))],
      ['Hub: Verwaltung', async (p) => void (await p.goto('/hub/admin'))],
      ['Gruppentest: Übersicht', async (p) => void (await p.goto('/session'))],
    ];
    for (const theme of ['light', 'dark'] as const) {
      for (const [name, open] of pages) {
        await open(page);
        await setTheme(page, theme);
        await expect(page.getByTestId('user-chip')).toBeVisible();
        await scan(page, `${name} (${theme})`);
      }
    }
  });

  test('Aufnahme-Workflow: Live, Auswertung, Speichern', async ({ page }) => {
    test.setTimeout(240_000);
    await toRecordStep(page, { speed: 5, type: 'cmj' });
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await scan(page, `Aufnahme bereit (${theme})`);
    }
    await page.getByTestId('record-start').click();
    await perform(page, 'cmj');
    await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('record-stop').click();
    await expect(page.getByTestId('rep-list')).toBeVisible();
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await scan(page, `Auswertung (${theme})`);
    }
    await page.getByTestId('next-button').click();
    await expect(page.getByTestId('save-button')).toBeVisible();
    await scan(page, 'Speichern');
  });

  test('Gruppentest (Warteschlange, Rangliste, Zwischenstand), Beamer, Dialoge', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/session?speed=10');
    await page.getByTestId('session-demo').click();
    await expect(page.getByTestId('session-runner')).toBeVisible();
    await page.getByTestId('sim-speed').selectOption('10');
    await page.getByTestId('connect-button').click();
    await expect(page.getByTestId('status-connection')).toContainText('Verbunden');
    await page.getByTestId('zero-start').click();
    await expect(page.getByTestId('status-zero')).toContainText('genullt', { timeout: 30_000 });
    await expect(page.getByTestId('queue').locator('li')).toHaveCount(10);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await scan(page, `Gruppentest Warteschlange (${theme})`);
    }
    await page.getByTestId('session-pause').click();
    await expect(page.getByTestId('summary-progress')).toBeVisible();
    await scan(page, 'Gruppentest Zwischenstand');
    await page.getByTestId('summary-resume').click();

    // Beamer-Ansicht in zweitem Tab
    const url = page.url();
    const id = /\/session\/([^/?]+)/.exec(url)![1]!;
    const board = await page.context().newPage();
    await board.goto(`/session/${id}/board`);
    await expect(board.locator('h1')).toBeVisible();
    await scan(board, 'Beamer-Ansicht');
    await board.close();

    // Dialog: Athlet anlegen (Hub)
    await page.goto('/hub/athletes');
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.getByTestId('hub-profile-new').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await scan(page, `Dialog Athlet anlegen (${theme})`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });

  test('Touch-Ziele: auf dem Tablet (grober Zeiger) sind alle Schaltflächen mindestens 44 px hoch', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({
      viewport: { width: 1194, height: 834 },
      isMobile: true,
      hasTouch: true,
      storageState: '.artifacts/admin.json',
    });
    const page = await ctx.newPage();
    const tooSmall = async (label: string): Promise<string[]> =>
      (
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('button, a.btn, nav a[href]')]
            .filter((e) => e.getBoundingClientRect().top >= 0 && !e.closest('.sr-only, .skip-link'))
            .map((e) => ({
              name: (e.getAttribute('data-testid') || e.textContent || e.tagName).trim().slice(0, 40),
              h: Math.round(e.getBoundingClientRect().height),
              w: Math.round(e.getBoundingClientRect().width),
            }))
            .filter((x) => x.h < 44 || x.w < 44),
        )
      ).map((x) => `${label}: ${x.name} ${x.w}×${x.h}`);
    const problems: string[] = [];
    await toRecordStep(page, { speed: 5, type: 'cmj' });
    problems.push(...(await tooSmall('Aufnahme')));
    await page.getByTestId('record-start').click();
    await perform(page, 'cmj');
    await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('record-stop').click();
    await expect(page.getByTestId('rep-list')).toBeVisible();
    problems.push(...(await tooSmall('Auswertung')));
    await page.goto('/hub/athletes');
    await expect(page.getByTestId('hub-profile-new')).toBeVisible();
    problems.push(...(await tooSmall('Hub')));
    expect(problems, problems.join('\n')).toEqual([]);
    await ctx.close();
  });

  test('Anmeldeseite', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByTestId('login-email')).toBeVisible();
    await scan(page, 'Anmeldung');
    await ctx.close();
  });
});
