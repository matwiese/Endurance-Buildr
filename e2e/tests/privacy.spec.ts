import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { collectErrors, shot } from './helpers.ts';
import { seedGroupsAndProfiles, uploadSyntheticTest } from './seed.ts';

const stamp = Date.now().toString(36);

test.describe('DSGVO', () => {
  test('Einwilligungssperre vor dem Test, Auskunft (JSON/CSV) und endgültige Löschung', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    const req = page.request;
    const now = new Date().toISOString();

    const { groups, profiles } = await seedGroupsAndProfiles(req, stamp, [
      { group: 'Datenschutz', people: [{ name: 'Mia', sex: 'f', dob: '2001-04-04', sport: 'Judo' }] },
    ]);
    const mia = profiles[0]!;
    const noahId = randomUUID();
    const noahName = `Noah ${stamp}`;
    const put = await req.put(`/api/profiles/${noahId}`, {
      data: {
        id: noahId,
        name: noahName,
        dateOfBirth: '2000-01-01',
        sex: 'm',
        heightCm: 180,
        weightKg: 80,
        sport: 'Judo',
        email: null,
        notes: null,
        externalId: null,
        allowPhotoVideo: false,
        guardianConsent: false,
        healthConsentAt: null,
        groupIds: [groups[0]!.id],
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(put.status(), await put.text()).toBe(201);
    await uploadSyntheticTest(req, { profileId: mia.id, createdAt: now, jumpHeightM: 0.31, seed: 7 });

    // ---- Sperre: ohne Einwilligung kein „Weiter“, Erfassen schaltet frei und speichert Fassung + Zeitpunkt ----
    await page.goto('/test?speed=5');
    await page.getByTestId('connect-button').click();
    await expect(page.getByTestId('status-connection')).toContainText('Verbunden');
    await page.getByTestId('next-button').click();
    await page.getByTestId('type-auto').click();
    await page.getByTestId('next-button').click();
    await page.getByTestId(`profile-select-${noahName}`).click({ timeout: 30_000 });
    await expect(page.getByTestId('consent-missing')).toContainText(noahName);
    await expect(page.getByTestId('next-button')).toBeDisabled();
    await shot(page, 'privacy-consent-gate');
    await expect(page.getByTestId('consent-grant')).toBeDisabled();
    await page.getByRole('switch').check();
    await page.getByTestId('consent-grant').click();
    await expect(page.getByTestId('next-button')).toBeEnabled();
    await expect(page.getByTestId('consent-missing')).toHaveCount(0);
    await expect
      .poll(async () => (await (await req.get(`/api/profiles/${noahId}/export`)).json()).profile, {
        timeout: 30_000,
      })
      .toMatchObject({ healthConsentVersion: '2026-10' });

    // ---- Auskunft: JSON (Server + Verweise auf Roh-Aufnahmen) und CSV ----
    await page.goto(`/hub/athletes/${mia.id}`);
    await expect(page.getByTestId('pp-name')).toContainText('Mia');
    const [json] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('pp-export-json').click(),
    ]);
    expect(json.suggestedFilename()).toMatch(/^export-mia-.*\.json$/);
    const exp = JSON.parse(await readFile((await json.path())!, 'utf8'));
    expect(exp).toMatchObject({ format: 'buildr-force-person-export', source: 'server' });
    expect(exp.profile.id).toBe(mia.id);
    expect(exp.tests).toHaveLength(1);
    expect(exp.recordings).toHaveLength(1);
    expect(exp.recordings[0]).toMatchObject({ format: 'BFB1', hz: 1000 });
    expect(JSON.stringify(exp)).not.toContain(noahName);
    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('pp-export-csv').click(),
    ]);
    const csvText = await readFile((await csv.path())!, 'utf8');
    expect(csvText.split(/\r?\n/).filter(Boolean)).toHaveLength(2);
    expect(csvText).toContain('Mia');
    await shot(page, 'privacy-profile');

    // ---- Löschung: Bestätigungswort nötig; danach ist alles weg (Server: 404 auf den Export, Tests entfernt) ----
    await page.getByTestId('pp-delete').click();
    await expect(page.getByTestId('pp-delete-confirm')).toBeDisabled();
    await page.getByTestId('pp-delete-word').fill('löschen');
    await page.getByTestId('pp-delete-confirm').click();
    await expect(page).toHaveURL(/\/hub\/athletes$/);
    await expect
      .poll(async () => (await req.get(`/api/profiles/${mia.id}/export`)).status(), { timeout: 30_000 })
      .toBe(404);
    const audit = await (await req.get('/api/audit?limit=50')).json();
    expect(JSON.stringify(audit)).toContain('profile.delete');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
