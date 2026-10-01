import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `.artifacts/${name}.png`, fullPage: true });

test('Haupt-Workflow: Verbinden → Nullen → Wiegen → Auto-Detect mehrerer Typen → Ergebnisse → Speichern', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/test?speed=5');
  // 1 Gerät: Simulator, 5× Tempo
  await page.getByTestId('sim-speed').selectOption('5');
  await page.getByTestId('connect-button').click();
  await expect(page.getByTestId('status-connection')).toContainText('Verbunden');
  await page.getByTestId('next-button').click();

  // 2 Test: Auto Detect
  await expect(page.getByTestId('type-auto')).toBeVisible();
  await shot(page, 'wf-02-testtype');
  await page.getByTestId('type-auto').click();
  await page.getByTestId('next-button').click();

  // 3 Athlet: neu anlegen
  await page.getByTestId('profile-new').click();
  await page.getByTestId('profile-name').fill('Test Athlet');
  await page
    .getByLabel('Einwilligung zur Verarbeitung von Gesundheitsdaten (Art. 9 DSGVO) liegt vor')
    .check();
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-select-Test Athlet')).toBeVisible();
  await page.getByTestId('next-button').click();

  // 4 Nullen
  await expect(page.getByTestId('zero-instruction')).toContainText('Nichts auf die Platten stellen');
  await page.getByTestId('zero-start').click();
  await expect(page.getByTestId('status-zero')).toContainText('genullt', { timeout: 30_000 });
  await shot(page, 'wf-04-zero');
  await page.getByTestId('next-button').click();

  // 5 Wiegen: Athlet tritt auf (Simulator-Steuerung über Aufnahme-Schritt nicht verfügbar → API)
  await expect(page.getByTestId('weigh-light')).toBeVisible();
  await page.getByTestId('sim-stepon').click();
  await expect(page.getByTestId('weigh-light')).toHaveAttribute('data-status', 'stable', { timeout: 40_000 });
  await shot(page, 'wf-05-weigh');
  await page.getByTestId('weigh-accept').click();

  // 6 Aufnahme
  await expect(page.getByTestId('record-start')).toBeVisible();
  await page.getByTestId('record-start').click();
  await expect(page.getByTestId('record-state')).toContainText('Aufnahme läuft');
  await page.getByText('Autopilot').first().click();
  await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 90_000 });
  await shot(page, 'wf-06-record');
  await expect(page.getByTestId('live-rep-list')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('record-stop').click();

  // 7 Ergebnis
  await expect(page.getByTestId('rep-list')).toBeVisible();
  await shot(page, 'wf-07-review');
  const nReps = await page.getByTestId('rep-list').locator('li').count();
  expect(nReps).toBeGreaterThanOrEqual(2);
  await page.getByTestId('next-button').click();

  // 8 Speichern
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('saved')).toBeVisible();
  await shot(page, 'wf-08-saved');
  expect(errors).toEqual([]);
});
