import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, shot } from './helpers.ts';

/** Ein Athlet im Gruppentest: auftreten → wiegen → aufnehmen (CMJ) → prüfen → speichern. */
async function testCurrentAthlete(page: Page): Promise<void> {
  await expect(page.getByTestId('session-current')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('sim-stepon').click();
  await expect(page.getByTestId('weigh-light')).toHaveAttribute('data-status', 'stable', { timeout: 40_000 });
  await page.getByTestId('weigh-accept').click();
  await page.getByTestId('record-start').click();
  await expect(page.getByTestId('record-state')).toContainText('Aufnahme läuft');
  await page.getByTestId('sim-type').selectOption('cmj');
  await page.getByTestId('sim-perform').click();
  await expect(page.getByTestId('live-results')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('record-stop').click();
  await expect(page.getByTestId('rep-list')).toBeVisible();
  await page.getByTestId('next-button').click();
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('saved')).toBeVisible();
}

test.describe('Gruppentest', () => {
  test('10 simulierte Athleten: Warteschlange → Rangliste live → Pause/Zwischenstand → Beenden → Export → Beamer', async ({
    page,
    context,
  }) => {
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    await page.goto('/session?speed=10');
    await page.getByTestId('session-demo').click();
    await expect(page.getByTestId('session-runner')).toBeVisible();

    // Einrichtung: einmal verbinden und nullen
    await page.getByTestId('sim-speed').selectOption('10');
    await page.getByTestId('connect-button').click();
    await expect(page.getByTestId('status-connection')).toContainText('Verbunden');
    await page.getByTestId('zero-start').click();
    await expect(page.getByTestId('status-zero')).toContainText('genullt', { timeout: 30_000 });
    await expect(page.getByTestId('queue').locator('li')).toHaveCount(10);
    await shot(page, 'session-01-queue');

    // erster Athlet wurde automatisch gestartet; zweiter wird übersprungen und später wieder eingereiht
    const rows = page.getByTestId('queue').locator('li');
    const secondName = (await rows.nth(1).locator('span.font-semibold').textContent())!;
    await page.getByTestId(`queue-skip-${secondName}`).click();
    await expect(page.getByTestId(`queue-${secondName}`)).toHaveAttribute('data-status', 'skipped');
    // dritten nach oben ziehen (Reihenfolge ändern)
    const thirdName = (await rows.nth(2).locator('span.font-semibold').textContent())!;
    await page.getByTestId(`queue-up-${thirdName}`).click();
    await expect(rows.nth(1).locator('span.font-semibold')).toHaveText(thirdName);

    // Athlet 1
    await testCurrentAthlete(page);
    await expect(page.getByTestId('board-rows').locator('li').first()).toBeVisible();
    await shot(page, 'session-02-first-result');
    await page.getByTestId('next-other').click();

    // Pause mit Zwischenstand
    await page.getByTestId('session-pause').click();
    await expect(page.getByTestId('summary-progress')).toContainText('1 von 10');
    await shot(page, 'session-03-pause');
    await page.getByTestId('summary-resume').click();
    await expect(page.getByTestId('session-runner')).toHaveAttribute('data-status', 'active');

    // übersprungenen Athleten wieder einreihen
    await page.getByRole('button', { name: 'Wieder einreihen' }).click();
    await expect(page.getByTestId(`queue-${secondName}`)).toHaveAttribute('data-status', 'waiting');

    // Restliche 9 Athleten
    for (let i = 1; i < 10; i++) {
      await testCurrentAthlete(page);
      if (i < 9) await page.getByTestId('next-other').click();
    }
    await expect(page.getByTestId('session-progress')).toContainText('10 von 10'); // „fertig“ ab dem Speichern
    await page.getByTestId('next-other').click(); // keiner mehr übrig → Hinweis
    await expect(page.getByTestId('session-idle')).toContainText('Alle Athleten sind durch');
    await expect(page.getByTestId('session-progress')).toContainText('10 von 10');

    // Rangliste: 10 Plätze, absteigend nach Sprunghöhe (Standardkennzahl CMJ)
    const board = page.getByTestId('board-rows').locator('li');
    await expect(board).toHaveCount(10);
    const values = await board.evaluateAll((els) =>
      els.map((e) =>
        Number(
          e
            .querySelector('[data-testid^="board-value-"]')!
            .textContent!.replace(',', '.')
            .replace(/[^\d.-]/g, ''),
        ),
      ),
    );
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    const ranks = await board.evaluateAll((els) => els.map((e) => e.getAttribute('data-rank')));
    expect(ranks[0]).toBe('1');
    expect(new Set(values).size).toBeGreaterThan(5); // unterschiedliche simulierte Fähigkeiten
    await shot(page, 'session-04-board');

    // Kennzahl wechseln → Rangliste sortiert neu
    await page.getByTestId('board-metric').selectOption({ index: 3 });
    await expect(board).toHaveCount(10);
    await page.getByTestId('board-metric').selectOption({ index: 0 });

    // Beenden + Export
    await page.getByTestId('session-finish').click();
    await expect(page.getByTestId('summary-progress')).toContainText('10 von 10');
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('session-export').click(),
    ]);
    const csv = await readFile((await dl.path())!, 'utf8');
    const lines = csv.trim().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(11);
    expect(lines[0]).toContain('Athlet;Testtyp;Zeit;Wdh.');
    await page.getByRole('button', { name: 'Schließen' }).click();
    await expect(page.getByTestId('session-runner')).toHaveAttribute('data-status', 'finished');

    // Beamer-Ansicht in zweitem Fenster zeigt dieselbe Rangliste
    const popup = await context.newPage();
    await popup.goto(page.url() + '/board');
    await expect(popup.getByTestId('beamer')).toBeVisible();
    await expect(popup.getByTestId('board-rows').locator('li')).toHaveCount(10);
    await shot(popup, 'session-05-beamer');
    await popup.close();

    // Auf dem Server: Session + 10 Tests mit sessionId
    await page.getByTestId('sync-now').click();
    await expect(page.getByTestId('sync-badge')).toContainText('Alles gesendet', { timeout: 60_000 });
    const sessions = await (await page.request.get('/api/sessions')).json();
    const s = sessions.find((x: { name: string }) => x.name.startsWith('Demo'));
    expect(s.status).toBe('finished');
    expect(s.queue.filter((q: { status: string }) => q.status === 'done')).toHaveLength(10);
    const tests = await (await page.request.get(`/api/tests?sessionId=${s.id}&limit=100`)).json();
    expect(tests).toHaveLength(10);
    expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
  });
});
