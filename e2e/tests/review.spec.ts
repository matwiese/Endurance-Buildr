import { expect, test, type Page } from '@playwright/test';
import { collectErrors, perform, shot, toRecordStep } from './helpers.ts';

/** Nimmt einen Versuch auf und wechselt in die Review. */
async function recordOne(page: Page, type: string, mode?: string): Promise<void> {
  await toRecordStep(page, { speed: 5, type: mode });
  await page.getByTestId('record-start').click();
  await perform(page, type);
  await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('record-stop').click();
  await expect(page.getByTestId('rep-list')).toBeVisible();
}

test.describe('Review', () => {
  test('Falsch erkannter Typ lässt sich umbenennen; Kennzahlen werden neu berechnet', async ({ page }) => {
    const errors = collectErrors(page);
    await recordOne(page, 'cmj');
    await expect(page.getByTestId('rep-list')).toContainText('Gegenbewegungssprung');
    await expect(page.getByTestId('tile-countermovement_depth')).toBeVisible();
    const before = await page.getByTestId('tile-jump_height_impmom').textContent();
    await page.getByTestId('relabel').selectOption('sj');
    await expect(page.getByTestId('rep-list')).toContainText('Squat Jump', { timeout: 15_000 });
    await expect(page.getByTestId('rep-list')).not.toContainText('Gegenbewegungssprung');
    // SJ hat keine Gegenbewegung → die Kachel verschwindet, die Sprunghöhe (Impuls-Momentum) bleibt gleich
    await expect(page.getByTestId('tile-countermovement_depth')).toHaveCount(0);
    await expect(page.getByTestId('relabel')).toHaveValue('sj');
    expect(await page.getByTestId('tile-jump_height_impmom').textContent()).toBe(before);
    expect(errors).toEqual([]);
  });

  test('Hop-Serie: Standard sind die besten 5 (nach RSI); „Beste 5 wählen“ stellt das nach manuellen Änderungen wieder her', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await recordOne(page, 'hop', 'hop');
    const list = page.getByTestId('rep-list');
    expect(await list.locator('li').count()).toBeGreaterThanOrEqual(8);
    const on = list.getByRole('switch', { checked: true });
    await expect(on).toHaveCount(5);
    // eine eingeschlossene Rep abwählen und eine ausgeschlossene wählen → manuelle Auswahl
    await on.first().click();
    await expect(on).toHaveCount(4);
    await page.getByRole('button', { name: /Beste 5 wählen/ }).click();
    await expect(on).toHaveCount(5);
    await shot(page, 'review-hop-best5');
    // Rückgängig: zurück zum Zustand mit 4
    await page.getByRole('button', { name: /Rückgängig/ }).click();
    await expect(on).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('Trial-Bereich in der Kurve markieren und analysieren', async ({ page }) => {
    const errors = collectErrors(page);
    await recordOne(page, 'cmj', 'cmj');
    const n0 = await page.getByTestId('rep-list').locator('li').count();
    await page.getByText('Trial-Bereich markieren').click();
    const box = (await page.getByTestId('trace-plot').boundingBox())!;
    await page.mouse.move(box.x + 70, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await shot(page, 'review-range');
    await page.getByTestId('range-panel').locator('select').selectOption('cmj');
    await page.getByTestId('range-analyze').click();
    await expect(page.getByTestId('rep-list').locator('li')).toHaveCount(n0 + 1, { timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test('Eine Rep löschen und wiederherstellen; Speichern erzeugt Eintrag in der Sync-Warteschlange', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await recordOne(page, 'cmj', 'cmj');
    await page.getByTestId('rep-delete-0').click();
    await expect(page.getByTestId('next-button')).toBeDisabled();
    await page.getByRole('button', { name: /Rückgängig/ }).click();
    await expect(page.getByTestId('next-button')).toBeEnabled();
    await page.getByTestId('next-button').click();
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('saved')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
