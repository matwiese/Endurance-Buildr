import { expect, test } from '@playwright/test';
import { collectErrors, perform, shot, toRecordStep } from './helpers.ts';

test.describe('Offline-first-Abgleich', () => {
  test('Offline aufnehmen und speichern → Warteschlange → nach Wiederverbinden automatisch auf dem Server', async ({
    page,
    context,
  }) => {
    const errors = collectErrors(page);
    await toRecordStep(page, { speed: 5, type: 'cmj' });
    await page.getByTestId('record-start').click();
    await perform(page, 'cmj');
    await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('record-stop').click();
    await expect(page.getByTestId('rep-list')).toBeVisible();
    await page.getByTestId('next-button').click();

    // Netz weg: Speichern funktioniert lokal, Upload wartet
    await context.setOffline(true);
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('saved')).toBeVisible();
    await expect(page.getByTestId('status-queue')).not.toHaveAttribute('data-pending', '0');
    const pendingOffline = Number(await page.getByTestId('status-queue').getAttribute('data-pending'));
    expect(pendingOffline).toBeGreaterThanOrEqual(1);
    await shot(page, 'sync-01-offline-queue');

    // Netz zurück → Abgleich startet selbstständig (online-Ereignis)
    await context.setOffline(false);
    await expect(page.getByTestId('status-queue')).toHaveAttribute('data-pending', '0', { timeout: 30_000 });
    await expect(page.getByTestId('sync-badge')).toContainText('Alles gesendet');
    await shot(page, 'sync-02-uploaded');

    // serverseitig vorhanden (Sitzung des Testkontexts)
    const tests = await (await page.request.get('/api/tests?limit=5')).json();
    expect(tests.length).toBeGreaterThanOrEqual(1);
    const newest = tests[0];
    expect(newest.status).toBe('uploaded');
    expect(newest.reps.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(newest.reps[0].metrics).length).toBeGreaterThan(5);
    const blob = await page.request.get(`/api/recordings/${newest.recordingId}`);
    expect(blob.ok()).toBe(true);
    expect((await blob.body()).length).toBeGreaterThan(1000);
    expect(errors.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(e))).toEqual(
      [],
    );
  });
});
