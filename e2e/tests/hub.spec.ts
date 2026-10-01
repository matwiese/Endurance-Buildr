import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, shot } from './helpers.ts';

const stamp = Date.now().toString(36);

/** wartet, bis die Warteschlange leer ist (Abzeichen im Kopf) */
async function waitSynced(page: Page): Promise<void> {
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-badge')).toContainText('Alles gesendet', { timeout: 30_000 });
}

test.describe('Hub: Stammdaten', () => {
  test('Gruppen anlegen → CSV importieren (Duplikate, Fehler) → Sammelzuweisung → Export → Löschen', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const cat = `Teams ${stamp}`;
    const g1 = `U19 ${stamp}`;
    const g2 = `Profis ${stamp}`;
    await page.goto('/hub');
    await expect(page).toHaveURL(/\/hub\/athletes$/);

    // --- Gruppen & Kategorien (Admin) ---
    await page.getByTestId('hub-nav-groups').click();
    await page.getByTestId('category-new').click();
    await page.getByTestId('name-dialog-input').fill(cat);
    await page.getByTestId('name-dialog-save').click();
    await expect(page.getByTestId(`category-${cat}`)).toBeVisible();
    for (const g of [g1, g2]) {
      await page.getByTestId(`group-new-${cat}`).click();
      await page.getByTestId('name-dialog-input').fill(g);
      await page.getByTestId('name-dialog-save').click();
      await expect(page.getByTestId(`group-${g}`)).toBeVisible();
    }
    await shot(page, 'hub-01-groups');

    // --- CSV-Import (Excel-Format) ---
    const csv = [
      'Vorname;Nachname;Geburtsdatum;Geschlecht;Größe;Gewicht;E-Mail;Gruppe;Mitgliedsnummer',
      `Anna;Alpha${stamp};17.05.2001;w;1,70;62,5;anna@example.org;${g1};M-${stamp}-1`,
      `Ben;Beta${stamp};03.11.2006;m;181;74;;${g1};M-${stamp}-2`,
      `Clara;Kaputt${stamp};31.02.2001;w;;;;${g1};`,
      `Dora;Dublette${stamp};01.01.2000;f;165;60;;${g2};`,
      `Dora;Dublette${stamp};01.01.2000;f;165;60;;${g2};`,
    ].join('\r\n');
    await page.getByTestId('hub-nav-athletes').click();
    await page.getByTestId('profiles-import').click();
    await page.getByTestId('import-text').fill(csv);
    await expect(page.getByTestId('import-summary')).toContainText('3 neu');
    await expect(page.getByTestId('import-summary')).toContainText('2 fehlerhaft');
    await expect(page.getByTestId('import-table')).toContainText('Geburtsdatum ungültig');
    await expect(page.getByTestId('import-table')).toContainText('Doppelt in der Datei');
    await shot(page, 'hub-02-import-preview');
    await page.getByTestId('import-run').click();
    await expect(page.getByTestId('import-done')).toContainText('3 Athleten');
    await page.getByRole('button', { name: 'Schließen' }).click();
    // 3 gültige Zeilen: Anna, Ben, Dora (erste Dublette)
    await page.getByTestId('profiles-search').fill(stamp);
    await expect(page.getByTestId('profiles-table').locator('tbody tr')).toHaveCount(3);

    // serverseitig angekommen
    await waitSynced(page);
    const onServer = await (await page.request.get(`/api/profiles?q=${stamp}`)).json();
    expect(onServer.map((p: { name: string }) => p.name).sort()).toEqual([
      `Anna Alpha${stamp}`,
      `Ben Beta${stamp}`,
      `Dora Dublette${stamp}`,
    ]);
    const anna = onServer.find((p: { name: string }) => p.name.startsWith('Anna'));
    expect(anna).toMatchObject({ dateOfBirth: '2001-05-17', sex: 'f', heightCm: 170, weightKg: 62.5 });

    // --- Re-Import derselben Datei: nichts doppelt, vorhandene = unverändert/Update ---
    await page.getByTestId('profiles-import').click();
    await page.getByTestId('import-text').fill(csv);
    await expect(page.getByTestId('import-summary')).toContainText('0 neu');
    await expect(page.getByTestId('import-summary')).toContainText('3 unverändert');
    await page.getByRole('button', { name: 'Abbrechen' }).click();

    // --- Sammelzuweisung: alle drei in die zweite Gruppe ---
    await page.getByTestId('select-all').check();
    await expect(page.getByTestId('bulk-bar')).toContainText('3 ausgewählt');
    await page.getByTestId('bulk-group').selectOption({ label: g2 });
    await page.getByTestId('bulk-add').click();
    await expect(page.getByTestId('bulk-result')).toContainText('2 geändert'); // Dora war schon in g2
    await page.getByTestId('bulk-group').selectOption({ label: g1 });
    await page.getByTestId('bulk-remove').click();
    await expect(page.getByTestId('bulk-result')).toContainText('geändert');
    await waitSynced(page);
    const after = await (await page.request.get(`/api/profiles?q=${stamp}`)).json();
    for (const p of after) expect(p.groupIds.length).toBeGreaterThanOrEqual(1);
    const groups = (await (await page.request.get('/api/reference')).json()).groups as Array<{
      id: string;
      name: string;
    }>;
    const id2 = groups.find((g) => g.name === g2)!.id;
    expect(after.every((p: { groupIds: string[] }) => p.groupIds.includes(id2))).toBe(true);
    await shot(page, 'hub-03-bulk');

    // --- Export ---
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('profiles-export').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('athleten.csv');
    const text = await readFile((await dl.path())!, 'utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toContain('name;date_of_birth;sex;height_cm');
    expect(text).toContain(`Anna Alpha${stamp}`);
    expect(text).toContain('2001-05-17');

    // --- Löschen (DSGVO) ---
    await page.getByTestId('select-all').uncheck();
    await page.getByLabel(`Ben Beta${stamp}`).check();
    await page.getByTestId('bulk-delete').click();
    await expect(page.getByTestId('delete-confirm')).toBeDisabled();
    await page.getByTestId('delete-word').fill('LÖSCHEN');
    await page.getByTestId('delete-confirm').click();
    await expect(page.getByTestId(`profile-row-Ben Beta${stamp}`)).toHaveCount(0);
    await waitSynced(page);
    const left = await (await page.request.get(`/api/profiles?q=${stamp}`)).json();
    expect(left.map((p: { name: string }) => p.name)).not.toContain(`Ben Beta${stamp}`);
    expect(left).toHaveLength(2);

    // Audit-Log enthält die Löschung (ohne Namen/Messwerte)
    await page.getByTestId('hub-nav-admin').click();
    await expect(page.getByTestId('audit-table')).toContainText('profile.delete');
    expect(await page.getByTestId('audit-table').textContent()).not.toContain('Beta');
    expect(errors).toEqual([]);
  });

  test('Tags und Nutzerverwaltung', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/hub/tags');
    const type = `Phase ${stamp}`;
    await page.getByTestId('tagtype-new').click();
    await page.getByTestId('name-dialog-input').fill(type);
    await page.getByTestId('name-dialog-save').click();
    await expect(page.getByTestId(`tagtype-${type}`)).toBeVisible();
    await page.getByTestId(`tag-new-${type}`).click();
    await page.getByTestId('name-dialog-input').fill('Vorsaison');
    await page.getByTestId('name-dialog-save').click();
    await expect(page.getByTestId(`tagtype-${type}`)).toContainText('Vorsaison');
    const ref = await (await page.request.get('/api/reference')).json();
    expect(ref.tags.map((t: { name: string }) => t.name)).toContain('Vorsaison');

    // Nutzer anlegen (Tester, nur eine Gruppe) und Fehlerfälle
    await page.getByTestId('hub-nav-admin').click();
    await page.getByTestId('user-new').click();
    const email = `tester-${stamp}@e2e.test`;
    await page.getByTestId('user-email').fill(email);
    await page.getByTestId('user-name').fill('Tim Tester');
    await page.getByTestId('user-password').fill('tester-passwort-1');
    await page.getByTestId('user-role').selectOption('tester');
    await page.getByTestId('user-scope').selectOption('restricted');
    await page.getByTestId('user-save').click();
    await expect(page.getByTestId(`user-row-${email}`)).toContainText('Tester');
    // doppelte E-Mail
    await page.getByTestId('user-new').click();
    await page.getByTestId('user-email').fill(email);
    await page.getByTestId('user-name').fill('Doppelt');
    await page.getByTestId('user-password').fill('tester-passwort-1');
    await page.getByTestId('user-save').click();
    await expect(page.getByRole('alert')).toContainText('bereits vergeben');
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await shot(page, 'hub-04-admin');
    expect(errors.filter((e) => !/409/.test(e))).toEqual([]);
  });
});
