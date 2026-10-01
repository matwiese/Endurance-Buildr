import { encodeBlob, jumpTrial, renderScript, standProfile, withRest } from '@buildr/core';
import type { ProfileDTO, RecordingRecord, TestRecord } from '@buildr/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HubHome } from '../src/pages/hub/HubHome.tsx';
import { resetDbForTests } from '../src/offline/db.ts';
import { localRepo } from '../src/offline/repo.ts';
import { useAuth } from '../src/state/auth.ts';
import { useSettings } from '../src/state/settings.ts';
import type * as FormatModule from '../src/lib/format.ts';

const download = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/format.ts', async (orig) => ({
  ...(await orig<typeof FormatModule>()),
  download,
}));

const H = 'jump_height_impmom';
const person = (id: string, name: string, over: Partial<ProfileDTO> = {}): ProfileDTO => ({
  id,
  name,
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
  healthConsentAt: 'x',
  groupIds: ['g1'],
  createdAt: 'x',
  updatedAt: 'x',
  ...over,
});
let n = 0;
const makeTest = (
  profileId: string,
  createdAt: string,
  value: number,
  over: Partial<TestRecord> = {},
): TestRecord => ({
  id: `t${++n}`,
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
  recordingId: `rec${n}`,
  zeroOffsets: { left: 0, right: 0 },
  notes: null,
  analysisVersion: '1',
  reps: [
    {
      id: `r${n}`,
      index: 0,
      startIdx: 1500,
      endIdx: 3500,
      included: true,
      type: 'cmj',
      confidence: 1,
      side: 'both',
      events: {},
      metrics: { [H]: value, contraction_time: 0.8 },
      warnings: [],
    },
  ],
  ...over,
});

const me = (role: 'admin' | 'viewer') => ({
  id: 'u',
  name: 'T',
  email: 't@x',
  role,
  groupScope: 'all' as const,
  organization: { id: 'o', name: 'O' },
  access: [],
});

async function setup(role: 'admin' | 'viewer' = 'admin') {
  await resetDbForTests();
  localStorage.clear();
  download.mockClear();
  useSettings.setState({ lang: 'de', normSetId: null, unitSystem: 'metric' });
  useAuth.setState(
    role === 'admin' ? { status: 'local', me: null } : { status: 'authenticated', me: me('viewer') },
  );
  await localRepo.categories.put({ id: 'c1', name: 'Teams' });
  await localRepo.groups.put({ id: 'g1', categoryId: 'c1', name: 'Frauen' });
  await localRepo.groups.put({ id: 'g2', categoryId: 'c1', name: 'Männer' });
}

const renderAt = (path: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/hub/*" element={<HubHome />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Normwerte', () => {
  beforeEach(() => setup());

  it('CSV einfügen → Prüfbericht → speichern → auswählen; Vorlage herunterladbar', async () => {
    renderAt('/hub/norms');
    const user = userEvent.setup();
    expect(await screen.findByText(/keine Normdaten mitgeliefert/i)).toBeInTheDocument();
    await user.type(screen.getByTestId('norm-name'), 'Meine Norm');
    fireEvent.change(screen.getByTestId('norm-text'), {
      target: {
        value:
          'test_type;metric;sex;age_min;age_max;mean;sd\r\ncmj;jump_height_impmom;f;18;30;30;4\r\ncmj;unbekannt;;;;1;1\r\n',
      },
    });
    expect(screen.getByTestId('norm-summary')).toHaveTextContent('1 gültig · 1 fehlerhaft');
    expect(within(screen.getByTestId('norm-preview')).getByText(/Kennzahl unbekannt/)).toBeInTheDocument();
    await user.click(screen.getByTestId('norm-save'));
    expect(await screen.findByTestId('norm-message')).toHaveTextContent('gespeichert');
    const item = await screen.findByTestId('norm-Meine Norm');
    expect(item).toHaveTextContent('1 Zeilen');
    await user.click(screen.getByTestId('norm-use-Meine Norm'));
    expect(useSettings.getState().normSetId).not.toBeNull();
    expect(await screen.findByText('In Verwendung')).toBeInTheDocument();
    await user.click(screen.getByTestId('norm-template'));
    expect(download.mock.calls[0]![1]).toContain('test_type;metric;sex');
  });

  it('Fehlende Pflichtspalten werden gemeldet; Speichern bleibt gesperrt', async () => {
    renderAt('/hub/norms');
    await screen.findByTestId('norm-text');
    fireEvent.change(screen.getByTestId('norm-text'), { target: { value: 'a,b\n1,2\n' } });
    expect(screen.getByTestId('norm-fatal')).toHaveTextContent('test_type, metric');
    expect(screen.getByTestId('norm-save')).toBeDisabled();
  });

  it('Nur Administratoren importieren (Betrachter sieht Hinweis)', async () => {
    await setup('viewer');
    renderAt('/hub/norms');
    expect(await screen.findByText(/Nur Administratoren importieren/)).toBeInTheDocument();
    expect(screen.queryByTestId('norm-save')).toBeNull();
  });
});

describe('Berichte', () => {
  beforeEach(async () => {
    await setup();
    const people = [
      person('a', 'Anna'),
      person('b', 'Bea'),
      person('c', 'Dan', { sex: 'm', groupIds: ['g2'] }),
    ];
    for (const p of people) await localRepo.profiles.put(p);
    const now = Date.now();
    const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
    for (const t of [
      makeTest('a', ago(5), 30),
      makeTest('a', ago(2), 36),
      makeTest('b', ago(3), 28),
      makeTest('c', ago(4), 40),
      makeTest('c', ago(200), 20),
    ])
      await localRepo.tests.put(t);
  });

  it('Tabelle: bester Wert im Zeitraum, Teamstatistik; Zeitraum filtert alte Tests', async () => {
    renderAt('/hub/reports');
    const user = userEvent.setup();
    await screen.findByTestId('rep-table');
    const cell = (who: string) => screen.findByTestId(`rep-cell-${who}-${H}`);
    expect(await cell('Anna')).toHaveTextContent('36,0 cm');
    expect(await cell('Dan')).toHaveTextContent('40,0 cm'); // der 200 Tage alte Test (20) liegt außerhalb von 90 Tagen
    expect(screen.getByTestId('rep-stat-mean')).toHaveTextContent('34,7 cm');
    await user.selectOptions(screen.getByTestId('rep-period'), 'all');
    await user.selectOptions(screen.getByTestId('rep-aggregate'), 'mean');
    expect(await screen.findByTestId(`rep-cell-Dan-${H}`)).toHaveTextContent('30,0 cm'); // Mittel aus 40 und 20
  });

  it('Gruppenfilter, z-Score (Team), Gruppenvergleich und CSV-Export', async () => {
    renderAt('/hub/reports');
    const user = userEvent.setup();
    await screen.findByTestId('rep-table');
    await user.click(await screen.findByTestId('rep-group-Männer'));
    await waitFor(() =>
      expect(within(screen.getByTestId('rep-table')).queryByTestId(`rep-cell-Anna-${H}`)).toBeNull(),
    );
    expect(screen.getByTestId(`rep-cell-Dan-${H}`)).toBeInTheDocument();
    await user.click(screen.getByTestId('rep-group-Männer')); // wieder alle
    await user.selectOptions(screen.getByTestId('rep-mode'), 'zTeam');
    const zs = await Promise.all(
      ['Anna', 'Bea', 'Dan'].map(async (w) =>
        parseFloat((await screen.findByTestId(`rep-cell-${w}-${H}`)).textContent!.replace(',', '.')),
      ),
    );
    expect(Math.abs(zs.reduce((a, b) => a + b, 0))).toBeLessThan(0.05);
    await user.selectOptions(screen.getByTestId('rep-mode'), 'value');

    await user.click(screen.getByTestId('rep-view-groups'));
    expect(await screen.findByTestId('rep-group-row-Frauen')).toHaveTextContent('2');
    expect(screen.getByTestId('rep-group-row-Männer')).toHaveTextContent('1');
    await user.click(screen.getByTestId('rep-view-table'));
    await user.click(screen.getByTestId('rep-csv'));
    const [file, csv] = download.mock.calls[0] as [string, string];
    expect(file).toBe('bericht-cmj.csv');
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toMatch(/^Athlet;Tests;Sprunghöhe \(Imp-Mom\) \[cm\]/);
    expect(lines).toHaveLength(1 + 3 + 4);
  });

  it('z-Score gegen Norm: ohne Normset Hinweis, mit gewähltem Normset Werte und Perzentil', async () => {
    await localRepo.kv.set('norms:list', [
      { id: 'ns1', name: 'Norm 1', description: null, updatedAt: 'x', rowCount: 1 },
    ]);
    await localRepo.kv.set('norms:set:ns1', {
      id: 'ns1',
      name: 'Norm 1',
      description: null,
      createdAt: 'x',
      updatedAt: 'x',
      rows: [
        {
          testType: 'cmj',
          metric: H,
          sex: 'f',
          ageMin: 18,
          ageMax: 40,
          sport: null,
          n: null,
          mean: 30,
          sd: 4,
          pct: {},
        },
      ],
    });
    renderAt('/hub/reports');
    const user = userEvent.setup();
    await screen.findByTestId('rep-table');
    await user.selectOptions(screen.getByTestId('rep-mode'), 'zNorm');
    expect(await screen.findByText(/zuerst ein Normset wählen/)).toBeInTheDocument();
    await user.selectOptions(await screen.findByTestId('rep-normset'), 'ns1');
    const anna = await screen.findByTestId(`rep-cell-Anna-${H}`);
    await waitFor(() => expect(anna).toHaveTextContent('1.50'));
    expect(anna).toHaveTextContent('P93');
    expect(screen.getByTestId(`rep-cell-Dan-${H}`)).toHaveTextContent('–'); // keine Norm für männlich
  });

  it('Kennzahlen: Auswahl ändert die Spalten, ohne Auswahl Hinweis', async () => {
    renderAt('/hub/reports');
    const user = userEvent.setup();
    await screen.findByTestId('rep-table');
    expect(
      within(screen.getByTestId('rep-table')).getByRole('columnheader', { name: 'Sprunghöhe (Flugzeit)' }),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId('rep-metric-jump_height_flight'));
    expect(
      within(screen.getByTestId('rep-table')).queryByRole('columnheader', { name: 'Sprunghöhe (Flugzeit)' }),
    ).toBeNull();
    await user.click(screen.getByTestId('rep-metric-contraction_time'));
    expect(
      within(screen.getByTestId('rep-table')).getByRole('columnheader', { name: 'Kontraktionszeit' }),
    ).toBeInTheDocument();
  });

  it('leer: Hinweis statt Tabelle', async () => {
    await localRepo.tests.remove('t1');
    for (const t of await localRepo.tests.list()) await localRepo.tests.remove(t.id);
    renderAt('/hub/reports');
    expect(await screen.findByTestId('rep-empty')).toBeInTheDocument();
  });
});

describe('Athletenprofil', () => {
  beforeEach(async () => {
    await setup();
    await localRepo.profiles.put(person('a', 'Anna'));
    const d = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    for (const [days, v] of [
      [100, 30],
      [70, 31],
      [40, 33],
      [5, 36],
    ] as const)
      await localRepo.tests.put(makeTest('a', d(days), v));
  });

  it('Verlauf: 4 Punkte, Baseline (Mittel der ersten 3), Änderung des letzten Tests, Testliste', async () => {
    renderAt('/hub/athletes/a');
    expect(await screen.findByTestId('pp-name')).toHaveTextContent('Anna');
    await waitFor(() => expect(screen.getAllByTestId('chart-point')).toHaveLength(4));
    expect(screen.getByTestId('baseline-line')).toBeInTheDocument();
    expect(screen.queryByTestId('norm-band')).toBeNull(); // keine Norm gewählt
    expect(screen.getByTestId('pp-change')).toHaveTextContent('+14,9 %');
    expect(screen.getByText(/Kein Normset gewählt/)).toBeInTheDocument();
    expect(within(screen.getByTestId('pp-history')).getAllByRole('row')).toHaveLength(5);
    // Baseline-Anzahl ändern: nur der erste Test → Änderung +20 %
    fireEvent.change(screen.getByTestId('pp-baseline-n'), { target: { value: '1' } });
    expect(screen.getByTestId('pp-change')).toHaveTextContent('+20 %');
    // Wertung „Letzter“ bleibt je Test gleich (eine Wiederholung)
    await userEvent.selectOptions(screen.getByTestId('pp-aggregate'), 'last');
    expect(screen.getAllByTestId('chart-point')).toHaveLength(4);
  });

  it('Norm-Band und z-Score erscheinen, sobald ein Normset gewählt ist', async () => {
    await localRepo.kv.set('norms:list', [
      { id: 'ns1', name: 'Norm 1', description: null, updatedAt: 'x', rowCount: 1 },
    ]);
    await localRepo.kv.set('norms:set:ns1', {
      id: 'ns1',
      name: 'Norm 1',
      description: null,
      createdAt: 'x',
      updatedAt: 'x',
      rows: [
        {
          testType: 'cmj',
          metric: H,
          sex: null,
          ageMin: null,
          ageMax: null,
          sport: null,
          n: null,
          mean: 30,
          sd: 4,
          pct: {},
        },
      ],
    });
    useSettings.setState({ normSetId: 'ns1' });
    renderAt('/hub/athletes/a');
    expect(await screen.findByTestId('norm-band')).toBeInTheDocument();
    expect(screen.getByTestId('pp-z')).toHaveTextContent('1.50 / 93.3');
  });

  it('Unbekannter Athlet: Hinweis; Athlet ohne Tests: leerer Zustand; Betrachter ohne „Bearbeiten“', async () => {
    renderAt('/hub/athletes/gibtsnicht');
    expect(await screen.findByText(/Keine Treffer/)).toBeInTheDocument();
  });

  it('Betrachter sieht kein „Bearbeiten“', async () => {
    useAuth.setState({ status: 'authenticated', me: me('viewer') });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    renderAt('/hub/athletes/a');
    await screen.findByTestId('pp-name');
    expect(screen.queryByTestId('pp-edit')).toBeNull();
    vi.restoreAllMocks();
  });
});

describe('Testdetail', () => {
  let trace: Awaited<ReturnType<typeof renderScript>>['trace'];
  beforeEach(async () => {
    await setup();
    await localRepo.profiles.put(person('a', 'Anna'));
    await localRepo.profiles.put(person('b', 'Ben'));
    await localRepo.tagTypes.put({ id: 'tt', name: 'Phase' });
    await localRepo.tags.put({ id: 'tg', tagTypeId: 'tt', name: 'Vorsaison' });
    const base = { mass: 70 };
    trace = renderScript(
      [standProfile(70, 1.5), ...withRest(base, jumpTrial({ ...base, jumpHeight: 0.3 }), 0.1, 2)],
      { hz: 1000, seed: 3, athlete: { bodyMass: 70 } },
    ).trace;
    void encodeBlob;
    const rec: RecordingRecord = {
      id: 'recX',
      hz: 1000,
      left: Float32Array.from(trace.left),
      right: Float32Array.from(trace.right),
      breaks: [],
      createdAt: 'x',
    };
    await localRepo.recordings.put(rec);
    await localRepo.tests.put(
      makeTest('a', new Date().toISOString(), 31.5, { id: 'tX', recordingId: 'recX' }),
    );
  });

  it('zeigt Rohkurve (lokale Aufnahme) und Kennzahlen; Notiz/Tag/Zuordnung/Ausschluss werden lokal gespeichert', async () => {
    renderAt('/hub/tests/tX');
    expect(await screen.findByTestId('test-detail')).toBeInTheDocument();
    expect(await screen.findByTestId('trace-plot')).toBeInTheDocument();
    expect(screen.queryByTestId('td-no-curve')).toBeNull();
    expect(screen.getByTestId(`td-metric-${H}`)).toHaveTextContent('31,5 cm');
    expect(screen.getByTestId('td-save')).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('td-notes'), 'nasser Boden');
    await user.click(screen.getByLabelText('Vorsaison'));
    await user.selectOptions(screen.getByTestId('td-profile'), 'b');
    await user.click(screen.getByTestId('td-include-0'));
    await user.click(screen.getByTestId('td-save'));
    expect(await screen.findByTestId('td-message')).toHaveTextContent('Gespeichert');
    const saved = (await localRepo.tests.get('tX'))!;
    expect(saved).toMatchObject({ notes: 'nasser Boden', tagIds: ['tg'], profileId: 'b' });
    expect(saved.reps[0]!.included).toBe(false);
  });

  it('ohne Rohdaten: Hinweis statt Kurve', async () => {
    await localRepo.recordings.remove('recX');
    renderAt('/hub/tests/tX');
    expect(await screen.findByTestId('td-no-curve')).toBeInTheDocument();
  });

  it('Löschen (Admin): Test und offener Upload verschwinden, Rückkehr zur Liste', async () => {
    await localRepo.outbox.add('test', 'tX');
    renderAt('/hub/tests/tX');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('td-delete'));
    await user.click(screen.getByTestId('confirm-yes'));
    await waitFor(async () => expect(await localRepo.tests.get('tX')).toBeUndefined());
    expect((await localRepo.outbox.list()).filter((o) => o.kind === 'test')).toHaveLength(0);
    expect(await screen.findByTestId('tests-empty')).toBeInTheDocument();
  });

  it('Test-Liste: Filter nach Athlet und Testtyp', async () => {
    await localRepo.tests.put(makeTest('b', new Date().toISOString(), 25, { id: 'tY', testType: 'sj' }));
    renderAt('/hub/tests');
    const user = userEvent.setup();
    const table = await screen.findByTestId('tests-table');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    await user.selectOptions(screen.getByTestId('tests-athlete'), 'b');
    await waitFor(() =>
      expect(within(screen.getByTestId('tests-table')).getAllByRole('row')).toHaveLength(2),
    );
    await user.selectOptions(screen.getByTestId('tests-athlete'), '');
    await user.selectOptions(screen.getByTestId('tests-type'), 'cmj');
    await waitFor(() =>
      expect(within(screen.getByTestId('tests-table')).getAllByRole('row')).toHaveLength(2),
    );
  });
});
