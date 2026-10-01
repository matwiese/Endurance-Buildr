import { CONSENT_VERSION, type ProfileDTO, type TestRecord } from '@buildr/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError, type Api } from '../src/api/client.ts';
import { ConsentCard } from '../src/components/ConsentCard.tsx';
import { buildPersonExport, personExportFilename, personResultsCsv } from '../src/hub/personExport.ts';
import { resetDbForTests } from '../src/offline/db.ts';
import { localRepo } from '../src/offline/repo.ts';
import { HubHome } from '../src/pages/hub/HubHome.tsx';
import { useAuth } from '../src/state/auth.ts';
import { useSettings } from '../src/state/settings.ts';
import type * as FormatModule from '../src/lib/format.ts';

const download = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/format.ts', async (orig) => ({
  ...(await orig<typeof FormatModule>()),
  download,
}));

const H = 'jump_height_impmom';
const person = (over: Partial<ProfileDTO> = {}): ProfileDTO => ({
  id: 'p1',
  name: 'Anna Ärztin',
  dateOfBirth: '2000-06-01',
  sex: 'f',
  heightCm: 170,
  weightKg: 65,
  sport: 'Handball',
  email: null,
  notes: null,
  externalId: null,
  allowPhotoVideo: false,
  guardianConsent: false,
  healthConsentAt: '2026-10-01T08:00:00.000Z',
  healthConsentVersion: CONSENT_VERSION,
  groupIds: ['g1'],
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  ...over,
});

const test = (id: string, profileId: string, createdAt: string, value = 31): TestRecord => ({
  id,
  profileId,
  sessionId: null,
  testType: 'cmj',
  detectedType: null,
  bodyMassKg: 70,
  externalLoadKg: 0,
  samplingHz: 1000,
  deviceSerial: null,
  createdAt,
  status: 'queued',
  tagIds: [],
  conditions: {},
  recordingId: `rec-${id}`,
  zeroOffsets: { left: 0, right: 0 },
  notes: null,
  analysisVersion: '1',
  reps: [
    {
      id: `r-${id}`,
      index: 0,
      startIdx: 1500,
      endIdx: 3500,
      included: true,
      type: 'cmj',
      confidence: 1,
      side: 'both',
      events: {},
      metrics: { [H]: value },
      warnings: [],
    },
  ],
});

const me = (role: 'admin' | 'tester') => ({
  id: 'u',
  name: 'T',
  email: 't@x',
  role,
  groupScope: 'all' as const,
  organization: { id: 'o', name: 'O' },
  access: [],
});

async function setup(auth: 'local' | 'admin' | 'tester' = 'local') {
  await resetDbForTests();
  localStorage.clear();
  download.mockClear();
  useSettings.setState({ lang: 'de', normSetId: null, unitSystem: 'metric' });
  useAuth.setState(
    auth === 'local' ? { status: 'local', me: null } : { status: 'authenticated', me: me(auth) },
  );
  await localRepo.categories.put({ id: 'c1', name: 'Teams' });
  await localRepo.groups.put({ id: 'g1', categoryId: 'c1', name: 'Frauen' });
  await localRepo.profiles.put(person());
  await localRepo.tests.put(test('t1', 'p1', '2026-10-01T09:00:00.000Z'));
  await localRepo.tests.put(test('t2', 'p1', '2026-10-01T10:00:00.000Z', 33));
}

const renderProfile = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/hub/athletes/p1']}>
        <Routes>
          <Route path="/hub/*" element={<HubHome />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Einwilligung (Art. 9 DSGVO)', () => {
  beforeEach(() => setup());

  it('ConsentCard: erst nach Ankreuzen speicherbar; speichert Zeitpunkt und Fassung', async () => {
    const noConsent = person({ healthConsentAt: null, healthConsentVersion: undefined });
    await localRepo.profiles.put(noConsent);
    const granted = vi.fn();
    render(<ConsentCard profile={noConsent} onGranted={granted} />);
    const user = userEvent.setup();
    expect(screen.getByTestId('consent-missing')).toHaveTextContent('Anna Ärztin');
    expect(screen.getByTestId('consent-grant')).toBeDisabled();
    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByTestId('consent-grant'));
    await waitFor(() => expect(granted).toHaveBeenCalledOnce());
    const saved = await localRepo.profiles.get('p1');
    expect(saved?.healthConsentVersion).toBe(CONSENT_VERSION);
    expect(Date.now() - Date.parse(saved!.healthConsentAt!)).toBeLessThan(5000);
    expect(granted.mock.calls[0]![0]).toMatchObject({ healthConsentVersion: CONSENT_VERSION });
  });

  it('Athletenprofil zeigt Fassung der Einwilligung; ältere Fassung wird markiert', async () => {
    await localRepo.profiles.put(person({ healthConsentVersion: '2020-01' }));
    renderProfile();
    expect(await screen.findByTestId('pp-name')).toHaveTextContent('Anna Ärztin');
    expect(screen.getByText(/Fassung 2020-01/)).toHaveTextContent('ältere Fassung');
  });
});

describe('Auskunft und Löschung (Art. 15/17/20 DSGVO)', () => {
  beforeEach(() => setup());

  it('JSON-Export (lokal): Profil, Gruppen und Tests; Dateiname ohne Sonderzeichen', async () => {
    renderProfile();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('pp-export-json'));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    const [name, content] = download.mock.calls[0]! as [string, string];
    expect(name).toBe('export-anna-arztin.json');
    const exp = JSON.parse(content);
    expect(exp).toMatchObject({ format: 'buildr-force-person-export', version: 1, source: 'local' });
    expect(exp.profile.name).toBe('Anna Ärztin');
    expect(exp.groups).toEqual([{ id: 'g1', name: 'Frauen' }]);
    expect(exp.tests.map((x: TestRecord) => x.id)).toEqual(['t1', 't2']);
    expect(screen.queryByTestId('pp-notice')).toBeNull(); // lokaler Modus: kein Hinweis auf fehlenden Server
  });

  it('CSV-Export: eine Zeile je Wiederholung mit Kennzahlen', async () => {
    renderProfile();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('pp-export-csv'));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    const [name, csv] = download.mock.calls[0]! as [string, string];
    expect(name).toBe('export-anna-arztin.csv');
    const lines = csv.replace('﻿', '').trim().split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Anna Ärztin');
    expect(lines[1]).toContain('31');
  });

  it('Servermodus: Serverauskunft + lokal noch nicht hochgeladene Tests; Offline → Gerätedaten', async () => {
    useAuth.setState({ status: 'authenticated', me: me('admin') });
    const profile = person();
    const server = {
      profile,
      groups: [{ id: 'g1', name: 'Frauen' }],
      tests: [test('t1', 'p1', '2026-10-01T09:00:00.000Z'), test('t0', 'p1', '2026-09-30T09:00:00.000Z')],
      recordings: [{ id: 'rec-t1' }],
      sessions: [],
      auditEvents: [{ action: 'test.create' }],
    };
    const api = { get: vi.fn().mockResolvedValue(server) } as unknown as Api;
    const exp = await buildPersonExport(profile, [], { api });
    expect(api.get).toHaveBeenCalledWith('/api/profiles/p1/export');
    expect(exp.source).toBe('server');
    expect(exp.tests.map((x) => x.id)).toEqual(['t0', 't1', 't2']); // t2 nur lokal
    expect(exp.recordings).toHaveLength(1);
    expect(exp.auditEvents).toHaveLength(1);

    const offline = { get: vi.fn().mockRejectedValue(new NetworkError()) } as unknown as Api;
    const fallback = await buildPersonExport(profile, [{ id: 'g1', categoryId: 'c1', name: 'Frauen' }], {
      api: offline,
    });
    expect(fallback.source).toBe('local');
    expect(fallback.groups).toEqual([{ id: 'g1', name: 'Frauen' }]);
    expect(fallback.tests.map((x) => x.id)).toEqual(['t1', 't2']);

    const forbidden = {
      get: vi.fn().mockRejectedValue(new ApiError(500, 'internal', null)),
    } as unknown as Api;
    await expect(buildPersonExport(profile, [], { api: forbidden })).rejects.toBeInstanceOf(ApiError);
  });

  it('Servermodus offline: Export liefert Gerätedaten und weist darauf hin', async () => {
    useAuth.setState({ status: 'authenticated', me: me('admin') });
    renderProfile();
    const user = userEvent.setup();
    // jsdom hat keinen Server unter dieser Adresse → fetch scheitert → NetworkError → Gerätedaten
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    try {
      await user.click(await screen.findByTestId('pp-export-json'));
      expect(await screen.findByTestId('pp-notice')).toHaveTextContent('nur die Daten dieses Geräts');
      expect(JSON.parse(download.mock.calls[0]![1] as string).source).toBe('local');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Löschen: nur Administratoren, nur mit Bestätigungswort; entfernt Profil, Tests und Aufnahmen lokal', async () => {
    await localRepo.recordings.put({
      id: 'rec-t1',
      hz: 1000,
      left: new Float64Array(2),
      right: new Float64Array(2),
      copX: new Float64Array(2),
      copY: new Float64Array(2),
      breaks: [],
    } as never);
    renderProfile();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('pp-delete'));
    const confirm = screen.getByTestId('pp-delete-confirm');
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId('pp-delete-word'), { target: { value: 'löschen' } });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(async () => expect(await localRepo.profiles.get('p1')).toBeUndefined());
    expect(await localRepo.tests.byProfile('p1')).toHaveLength(0);
    expect(await localRepo.recordings.get('rec-t1')).toBeUndefined();
  });

  it('Löschen im Servermodus wird vorgemerkt (delete-profile) und ist für Tester nicht sichtbar', async () => {
    await setup('tester');
    renderProfile();
    await screen.findByTestId('pp-export-json');
    expect(screen.queryByTestId('pp-delete')).toBeNull();

    useAuth.setState({ status: 'authenticated', me: me('admin') });
    // Serverlauf verhindern: Sync soll nur vormerken
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    try {
      const user = userEvent.setup();
      await user.click(await screen.findByTestId('pp-delete'));
      fireEvent.change(screen.getByTestId('pp-delete-word'), { target: { value: 'LÖSCHEN' } });
      await user.click(screen.getByTestId('pp-delete-confirm'));
      await waitFor(async () =>
        expect((await localRepo.outbox.list()).some((o) => o.kind === 'delete-profile')).toBe(true),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Hilfsfunktionen', () => {
  it('Dateiname: Umlaute und Sonderzeichen werden bereinigt, leerer Name fällt auf die ID zurück', () => {
    expect(personExportFilename(person({ name: 'Zoë O’Neil-Müller' }), 'json')).toBe(
      'export-zoe-o-neil-muller.json',
    );
    expect(personExportFilename(person({ name: '???', id: 'abcdef12-0000' }), 'csv')).toBe(
      'export-abcdef12.csv',
    );
  });

  it('CSV nutzt die Sprache der Oberfläche', async () => {
    await setup();
    const exp = await buildPersonExport(person(), []);
    expect(personResultsCsv(exp, 'en')).toContain('Athlete');
    expect(personResultsCsv(exp, 'de')).toContain('Athlet');
  });
});
