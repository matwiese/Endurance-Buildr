import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ADMIN } from '../playwright.config.ts';
import { collectErrors, shot } from './helpers.ts';
import { seedGroupsAndProfiles, uploadSyntheticTest } from './seed.ts';

const stamp = Date.now().toString(36);
const DAY = 86_400_000;
const ago = (days: number): string => new Date(Date.now() - days * DAY).toISOString();
const iso = (days: number): string => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

test.describe('Hub: Verlauf, Normen, Berichte, Testdetail', () => {
  test('Athletenverlauf mit Baseline und Norm, Testdetail bearbeiten, Berichte (Tabelle/Diagramm/Gruppen, z-Score, % Änderung, CSV, PDF)', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    const req = page.request;

    // ---- Daten per API: 2 Gruppen, 5 Athleten, simulierte CMJ über mehrere Monate ----
    const { groups, profiles } = await seedGroupsAndProfiles(req, stamp, [
      {
        group: 'Frauen',
        people: [
          { name: 'Anna', sex: 'f', dob: '2002-03-10', sport: 'Handball' },
          { name: 'Bea', sex: 'f', dob: '2001-07-01', sport: 'Handball' },
          { name: 'Cora', sex: 'f', dob: '2003-01-15', sport: 'Handball' },
        ],
      },
      {
        group: 'Männer',
        people: [
          { name: 'Dan', sex: 'm', dob: '2000-05-05', sport: 'Fußball' },
          { name: 'Emil', sex: 'm', dob: '1999-09-09', sport: 'Fußball' },
        ],
      },
    ]);
    const P = Object.fromEntries(profiles.map((p) => [p.name.split(' ')[0]!, p]));
    const plan: Array<[string, number, number]> = [
      ['Anna', 110, 0.3],
      ['Anna', 80, 0.31],
      ['Anna', 50, 0.33],
      ['Anna', 10, 0.36],
      ['Bea', 60, 0.28],
      ['Bea', 20, 0.29],
      ['Cora', 30, 0.33],
      ['Dan', 70, 0.38],
      ['Dan', 15, 0.4],
      ['Emil', 25, 0.35],
    ];
    const ids: Record<string, string[]> = {};
    let seed = 1;
    for (const [who, days, h] of plan) {
      (ids[who] ??= []).push(
        await uploadSyntheticTest(req, {
          profileId: P[who]!.id,
          createdAt: ago(days),
          jumpHeightM: h,
          seed: seed++,
        }),
      );
    }

    // ---- Normset importieren (eigene, frei erfundene Testwerte) und verwenden ----
    await page.goto('/hub/norms');
    await expect(page.getByTestId('norm-fatal')).toHaveCount(0);
    await page.getByTestId('norm-name').fill(`E2E-Norm ${stamp}`);
    await page
      .getByTestId('norm-text')
      .fill(
        [
          'test_type;metric;sex;age_min;age_max;sport;n;mean;sd',
          'cmj;jump_height_impmom;f;18;30;;100;30;4',
          'cmj;jump_height_impmom;m;18;30;;100;40;5',
          'cmj;gibt_es_nicht;;;;;;1;1',
        ].join('\r\n'),
      );
    await expect(page.getByTestId('norm-summary')).toContainText('2 gültig · 1 fehlerhaft');
    await expect(page.getByTestId('norm-preview')).toContainText('Kennzahl unbekannt');
    await page.getByTestId('norm-save').click();
    await expect(page.getByTestId('norm-message')).toContainText('gespeichert');
    await page.getByTestId(`norm-use-E2E-Norm ${stamp}`).click();
    await expect(page.getByTestId(`norm-E2E-Norm ${stamp}`)).toContainText('In Verwendung');

    // ---- Athletenprofil: Verlauf, Baseline, Norm-Band ----
    await page.goto('/hub/athletes');
    await page.getByTestId('profiles-search').fill(stamp);
    await page.getByTestId(`profile-link-${P['Anna']!.name}`).click();
    await expect(page.getByTestId('pp-name')).toContainText('Anna');
    await expect(page.getByTestId('chart-point')).toHaveCount(4);
    await expect(page.getByTestId('baseline-line')).toBeVisible();
    await expect(page.getByTestId('norm-band')).toBeVisible();
    await expect(page.getByTestId('pp-change')).toHaveText(/^\+1[3-6][.,]\d %$/); // 36 gegenüber Mittel der ersten drei (≈ 31,3)
    await expect(page.getByTestId('pp-z')).toHaveText(/^1[.,][3-7]\d \/ \d{2}/); // z ≈ 1,5 gegenüber Norm 30 ± 4
    await expect(page.getByTestId('pp-history').locator('tbody tr')).toHaveCount(4);
    await shot(page, 'm8-01-progress');

    // ---- Testdetail: Rohkurve, Kennzahlen, Bearbeiten ----
    await page.getByTestId('chart-point').last().click();
    await expect(page.getByTestId('test-detail')).toBeVisible();
    await expect(page.getByTestId('td-no-curve')).toHaveCount(0);
    await expect(page.getByTestId('trace-plot')).toBeVisible();
    await expect(page.getByTestId('td-metric-jump_height_impmom')).toContainText('cm');
    await shot(page, 'm8-02-test-detail');
    const latest = ids['Anna']![3]!;
    await page.getByTestId('td-notes').fill('E2E-Notiz');
    await page.getByTestId('td-include-0').uncheck();
    await page.getByTestId('td-save').click();
    await expect(page.getByTestId('td-message')).toContainText('Gespeichert');
    const patched = await (await req.get(`/api/tests/${latest}`)).json();
    expect(patched.notes).toBe('E2E-Notiz');
    expect(patched.reps[0].included).toBe(false);
    await page.getByTestId('td-include-0').check();
    await page.getByTestId('td-save').click();
    await expect(page.getByTestId('td-message')).toContainText('Gespeichert');
    expect((await (await req.get(`/api/tests/${latest}`)).json()).reps[0].included).toBe(true);

    // ---- Berichte ----
    await page.goto('/hub/reports');
    await page.getByTestId('rep-period').selectOption('all');
    await page.getByTestId(`rep-group-${groups[0]!.name}`).check({ force: true });
    await page.getByTestId(`rep-group-${groups[1]!.name}`).check({ force: true });
    const h = 'jump_height_impmom';
    await expect(page.getByTestId('rep-table').locator('tbody tr')).toHaveCount(5);
    const cell = async (who: string, metric = h) =>
      (await page.getByTestId(`rep-cell-${P[who]!.name}-${metric}`).textContent())!;
    expect(parseFloat((await cell('Anna')).replace(',', '.'))).toBeCloseTo(36, 0); // bester Wert im Zeitraum
    expect(parseFloat((await cell('Dan')).replace(',', '.'))).toBeCloseTo(40, 0);
    await expect(page.getByTestId('rep-stat-mean')).toContainText('5');
    await shot(page, 'm8-03-report-table');

    // z-Score (Team): Summe ≈ 0
    await page.getByTestId('rep-mode').selectOption('zTeam');
    const zs = await Promise.all(
      ['Anna', 'Bea', 'Cora', 'Dan', 'Emil'].map(async (w) => parseFloat((await cell(w)).replace(',', '.'))),
    );
    expect(zs.every(Number.isFinite)).toBe(true);
    expect(Math.abs(zs.reduce((a, b) => a + b, 0))).toBeLessThan(0.05);
    // z-Score (Norm): Anna (f) 36 ↔ 30 ± 4 ⇒ 1,5; Dan (m) 40 ↔ 40 ± 5 ⇒ 0
    await page.getByTestId('rep-mode').selectOption('zNorm');
    expect(parseFloat((await cell('Anna')).replace(',', '.'))).toBeCloseTo(1.5, 0);
    expect(Math.abs(parseFloat((await cell('Dan')).replace(',', '.')))).toBeLessThan(0.15);
    await expect(page.getByTestId(`rep-cell-${P['Anna']!.name}-${h}`)).toContainText('P9');
    // % Änderung gegenüber Vergleichszeitraum (Annas erste drei Tests: vor 120 … 40 Tagen)
    await page.getByTestId('rep-mode').selectOption('pctChange');
    await page.getByTestId('rep-base-from').fill(iso(125));
    await page.getByTestId('rep-base-to').fill(iso(40));
    await expect(page.getByTestId(`rep-cell-${P['Anna']!.name}-${h}`)).toHaveText(/^\+1[3-6][.,]\d %$/);
    await expect(page.getByTestId(`rep-cell-${P['Cora']!.name}-${h}`)).toHaveText('–'); // keine Basis
    await page.getByTestId('rep-mode').selectOption('value');

    // Diagramm und Gruppenvergleich
    await page.getByTestId('rep-view-chart').click();
    await expect(page.getByTestId('bar-chart').locator('[data-testid^="bar-"]')).toHaveCount(
      5 + 1 /* Mittelwertlinie */ - 1 + 1 - 1 + 1,
    );
    await shot(page, 'm8-04-report-chart');
    await page.getByTestId('rep-view-groups').click();
    await expect(page.getByTestId(`rep-group-row-${groups[0]!.name}`)).toContainText('3');
    await expect(page.getByTestId(`rep-group-row-${groups[1]!.name}`)).toContainText('2');
    await shot(page, 'm8-05-report-groups');
    await page.getByTestId('rep-view-table').click();

    // höchstens 20 Kennzahlen
    const boxes = page.locator('[data-testid^="rep-metric-"]');
    const total = await boxes.count();
    for (let i = 0; i < total; i++) {
      const b = boxes.nth(i);
      if (!(await b.isChecked()) && (await b.isEnabled())) await b.check({ force: true });
    }
    expect(await boxes.locator(':checked').count()).toBeLessThanOrEqual(20);

    // CSV
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('rep-csv').click()]);
    const csv = await readFile((await dl.path())!, 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines.length).toBe(1 + 5 + 4);
    expect(lines[0]).toMatch(/^Athlet;Tests;/);
    expect(csv).toContain(P['Anna']!.name);

    // PDF (Druckansicht)
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('header').first()).toBeHidden();
    await expect(page.getByTestId('rep-table')).toBeVisible();
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(8000);
    await page.emulateMedia({ media: 'screen' });

    // ---- Rollen: Betrachter sieht Berichte, kann aber nichts bearbeiten ----
    const email = `viewer-m8-${stamp}@e2e.test`;
    expect(
      (
        await req.post('/api/users', {
          data: { email, name: 'Vera', password: 'viewer-passwort-1', role: 'viewer' },
        })
      ).status(),
    ).toBe(201);
    const ctx = await browser.newContext({
      baseURL: page.url().split('/hub')[0],
      storageState: { cookies: [], origins: [] },
    });
    const vp = await ctx.newPage();
    await vp.goto('/');
    await vp.getByTestId('login-email').fill(email);
    await vp.getByTestId('login-password').fill('viewer-passwort-1');
    await vp.getByTestId('login-submit').click();
    await expect(vp.getByTestId('user-chip')).toContainText('Betrachter'); // erst wenn die Anmeldung durch ist
    await vp.goto(`/hub/tests/${latest}`);
    await expect(vp.getByTestId('test-detail')).toBeVisible();
    await expect(vp.getByTestId('td-save')).toHaveCount(0);
    await expect(vp.getByTestId('td-delete')).toHaveCount(0);
    await vp.goto('/hub/reports');
    await expect(vp.getByTestId('reports-page')).toBeVisible();
    await expect(vp.getByTestId('hub-nav-admin')).toHaveCount(0);
    await ctx.close();

    // ---- Löschen (Admin) ----
    await page.goto(`/hub/tests/${ids['Emil']![0]}`);
    await page.getByTestId('td-delete').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page).toHaveURL(/\/hub\/tests$/);
    expect((await req.get(`/api/tests/${ids['Emil']![0]}`)).status()).toBe(404);
    void ADMIN;
    expect(errors.filter((e) => !/Failed to load resource|401|403|404/.test(e))).toEqual([]);
  });
});
