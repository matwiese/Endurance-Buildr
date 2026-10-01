import { expect, test } from '@playwright/test';
import { collectErrors, perform, shot, toRecordStep } from './helpers.ts';

test.describe('Live-Aufnahme', () => {
  test('Anzeige: ≥ 50 fps bei 2 × 1000 Hz, Latenz < 100 ms, Sofortergebnis nach Landung', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await toRecordStep(page, { speed: 1, type: 'cmj' });
    await page.getByTestId('record-start').click();
    await expect(page.getByTestId('record-state')).toContainText('Aufnahme läuft');
    await perform(page, 'cmj');
    // Frame-Rate der Seite während der laufenden Live-Kurve messen
    const fps = await page.evaluate(
      () =>
        new Promise<{ fps: number; worstMs: number }>((resolve) => {
          const stamps: number[] = [];
          const t0 = performance.now();
          const tick = (t: number) => {
            stamps.push(t);
            if (t - t0 < 3000) requestAnimationFrame(tick);
            else {
              const d = stamps.slice(1).map((s, i) => s - stamps[i]!);
              resolve({
                fps: (stamps.length - 1) / ((stamps[stamps.length - 1]! - stamps[0]!) / 1000),
                worstMs: Math.max(...d),
              });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`FPS ${fps.fps.toFixed(1)}, längster Frame ${fps.worstMs.toFixed(0)} ms`);
    expect(fps.fps).toBeGreaterThan(50);
    expect(fps.worstMs).toBeLessThan(120);
    const lat = await page.getByTestId('status-latency').textContent();
    const ms = Number(/(\d+)\s*ms/.exec(lat ?? '')?.[1]);
    console.log('Latenz-Anzeige:', lat);
    expect(ms).toBeLessThan(100);
    await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'live-01-result');
    expect(errors).toEqual([]);
  });

  test('Re-Zero während der Aufnahme: Aufnahme läuft weiter, danach wird weiter korrekt ausgewertet', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await toRecordStep(page, { speed: 5, type: 'cmj' });
    await page.getByTestId('record-start').click();
    await expect(page.getByTestId('record-state')).toContainText('Aufnahme läuft');
    await perform(page, 'cmj');
    await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 30_000 });
    // Athlet tritt ab, Platten werden neu genullt, Athlet tritt wieder auf, zweiter Sprung
    await page.getByTestId('sim-stepoff').click();
    await expect(page.getByTestId('sim-presence')).toContainText('empty', { timeout: 15_000 });
    await page.getByTestId('record-rezero').click();
    await expect(page.getByTestId('status-zero')).toContainText('genullt', { timeout: 30_000 });
    await expect(page.getByTestId('record-state')).toContainText('Aufnahme läuft');
    await page.getByTestId('sim-stepon').click();
    await expect(page.getByTestId('sim-presence')).toContainText('standing', { timeout: 15_000 });
    await perform(page, 'cmj');
    await expect(page.getByTestId('live-rep-list').locator('li')).toHaveCount(1, { timeout: 60_000 });
    await shot(page, 'live-02-rezero');
    await page.getByTestId('record-stop').click();
    await expect(page.getByTestId('rep-list').locator('li')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('Pause und Fortsetzen verlieren keine Wiederholung', async ({ page }) => {
    const errors = collectErrors(page);
    await toRecordStep(page, { speed: 5, type: 'cmj' });
    await page.getByTestId('record-start').click();
    await perform(page, 'cmj');
    await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('record-pause').click();
    await expect(page.getByTestId('record-state')).toContainText('Pausiert');
    await page.getByTestId('record-resume').click();
    await expect(page.getByTestId('record-state')).toContainText('Aufnahme läuft');
    await perform(page, 'cmj');
    await expect(page.getByTestId('live-rep-list').locator('li')).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId('record-stop').click();
    await expect(page.getByTestId('rep-list').locator('li')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
});
