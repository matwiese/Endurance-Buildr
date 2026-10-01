import type { SessionDTO, TestRecord } from '@buildr/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from '../src/offline/db.ts';
import { localRepo } from '../src/offline/repo.ts';
import { useAuth } from '../src/state/auth.ts';
import { useSettings } from '../src/state/settings.ts';
import { syncEngine } from '../src/sync/index.ts';
import { demoProfiles, simAthleteFor } from '../src/session/demo.ts';
import { sessionResultsCsv } from '../src/session/export.ts';
import { Leaderboard } from '../src/session/Leaderboard.tsx';
import { QueuePanel } from '../src/session/QueuePanel.tsx';
import {
  addToQueue,
  moveInQueue,
  newSession,
  nextWaiting,
  progress,
  removeFromQueue,
  setQueueStatus,
  withBoard,
  withStatus,
} from '../src/session/queue.ts';
import { SessionsPage } from '../src/session/SessionsPage.tsx';
import { defaultMetricFor, metricOptionsFor } from '../src/session/metrics.ts';

const session = (ids: string[] = ['a', 'b', 'c']): SessionDTO =>
  newSession({
    id: 's1',
    name: 'Test',
    mode: 'cmj',
    externalLoadKg: 0,
    groupId: null,
    profileIds: ids,
    now: '2026-10-01T10:00:00.000Z',
  });

describe('Warteschlange (rein)', () => {
  it('neue Session: alle wartend, Duplikate entfernt, Rangliste auf den Testtyp voreingestellt', () => {
    const s = newSession({
      id: 'x',
      name: ' ',
      mode: 'cmj',
      externalLoadKg: -5,
      groupId: null,
      profileIds: ['a', 'a', 'b'],
    });
    expect(s.queue).toEqual([
      { profileId: 'a', status: 'waiting' },
      { profileId: 'b', status: 'waiting' },
    ]);
    expect(s.externalLoadKg).toBe(0);
    expect(s.name).toBe('x'.slice(0, 8));
    expect(s.board.testType).toBe('cmj');
    expect(
      newSession({ id: 'y', name: 'a', mode: 'auto', externalLoadKg: 0, groupId: null, profileIds: [] }).board
        .testType,
    ).toBeNull();
  });

  it('umsortieren, hinzufügen (ohne Dubletten), entfernen', () => {
    let s = session();
    s = moveInQueue(s, 'c', -1);
    expect(s.queue.map((q) => q.profileId)).toEqual(['a', 'c', 'b']);
    expect(moveInQueue(s, 'a', -1)).toBe(s); // Grenze → unverändert
    expect(moveInQueue(s, 'b', 1)).toBe(s);
    s = addToQueue(s, ['d', 'a', 'd']);
    expect(s.queue.map((q) => q.profileId)).toEqual(['a', 'c', 'b', 'd']);
    expect(addToQueue(s, ['a'])).toBe(s);
    s = removeFromQueue(s, 'c');
    expect(s.queue.map((q) => q.profileId)).toEqual(['a', 'b', 'd']);
  });

  it('höchstens ein Athlet gleichzeitig „testing“; nextWaiting geht zyklisch weiter und überspringt Erledigte', () => {
    let s = session(['a', 'b', 'c', 'd']);
    s = setQueueStatus(s, 'a', 'testing');
    s = setQueueStatus(s, 'b', 'testing');
    expect(s.queue.map((q) => q.status)).toEqual(['waiting', 'testing', 'waiting', 'waiting']);
    s = setQueueStatus(s, 'b', 'done');
    s = setQueueStatus(s, 'c', 'skipped');
    expect(nextWaiting(s)?.profileId).toBe('a');
    expect(nextWaiting(s, 'b')?.profileId).toBe('d');
    expect(nextWaiting(s, 'd')?.profileId).toBe('a'); // zurück an den Anfang
    s = setQueueStatus(setQueueStatus(s, 'a', 'done'), 'd', 'done');
    expect(nextWaiting(s)).toBeUndefined();
    expect(progress(s)).toEqual({ done: 3, total: 4, waiting: 0, skipped: 1 });
  });

  it('Status/Board ändern setzt updatedAt (letzter Schreiber gewinnt); Beenden setzt finishedAt', () => {
    const s = session();
    const b = withBoard(s, { metric: 'jump_height_flight', aggregate: 'mean' });
    expect(b.board).toMatchObject({ metric: 'jump_height_flight', aggregate: 'mean', testType: 'cmj' });
    expect(b.updatedAt > s.updatedAt).toBe(true);
    const f = withStatus(s, 'finished');
    expect(f.finishedAt).not.toBeNull();
    expect(withStatus(f, 'active').finishedAt).toBeNull();
  });
});

describe('Demo und Kennzahlen', () => {
  it('Demo: 10 Athleten, gültige Daten; simulierte Eigenschaften deterministisch und im Bereich', () => {
    const ps = demoProfiles({ id: 'g', categoryId: 'c', name: 'G' });
    expect(ps).toHaveLength(10);
    expect(new Set(ps.map((p) => p.id)).size).toBe(10);
    expect(
      ps.every(
        (p) => /^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth!) && !Number.isNaN(Date.parse(p.dateOfBirth!)),
      ),
    ).toBe(true);
    for (const p of ps) {
      const a = simAthleteFor(p);
      expect(simAthleteFor(p)).toEqual(a);
      expect(a.abilityM).toBeGreaterThanOrEqual(0.22);
      expect(a.abilityM).toBeLessThanOrEqual(0.48);
      expect(Math.abs(a.asymmetry)).toBeLessThanOrEqual(0.08);
      expect(a.bodyMass).toBe(p.weightKg);
    }
    expect(new Set(ps.map((p) => simAthleteFor(p).abilityM)).size).toBeGreaterThan(5);
  });

  it('Kennzahlen je Testtyp: Standard zuerst, nur passende Familie', () => {
    expect(defaultMetricFor('cmj')).toBe('jump_height_impmom');
    const keys = metricOptionsFor('cmj').map((m) => m.key);
    expect(keys[0]).toBe('jump_height_impmom');
    expect(keys).toContain('countermovement_depth');
    expect(metricOptionsFor('sj').map((m) => m.key)).not.toContain('countermovement_depth');
  });
});

const rep = (
  i: number,
  v: Record<string, number | null>,
  over: Partial<TestRecord['reps'][number]> = {},
) => ({
  id: `r${i}`,
  index: i,
  startIdx: 0,
  endIdx: 1,
  included: true,
  type: 'cmj' as const,
  confidence: 1,
  side: 'both' as const,
  events: {},
  metrics: v,
  warnings: [],
  ...over,
});
const test = (
  id: string,
  profileId: string | null,
  vals: Array<Record<string, number | null>>,
  createdAt = '2026-10-01T10:00:00.000Z',
  testType: TestRecord['testType'] = 'cmj',
): TestRecord => ({
  id,
  profileId,
  sessionId: 's1',
  testType,
  detectedType: null,
  bodyMassKg: 80,
  externalLoadKg: 0,
  samplingHz: 1000,
  deviceSerial: null,
  createdAt,
  status: 'uploaded',
  tagIds: [],
  conditions: {},
  recordingId: 'rec',
  zeroOffsets: { left: 0, right: 0 },
  notes: null,
  reps: vals.map((v, i) => rep(i, v)),
  analysisVersion: '1',
});
const people = new Map(
  ['a', 'b', 'c', 'd'].map((id) => [
    id,
    { id, name: `Person ${id.toUpperCase()}`, groupIds: ['g'] } as never,
  ]),
);

describe('Leaderboard-Komponente', () => {
  beforeEach(() => useSettings.setState({ lang: 'de', unitSystem: 'metric' }));
  const H = 'jump_height_impmom';

  it('Rangliste nach Sprunghöhe, Gleichstand teilt den Platz, Wartende hinten; Kennzahl wechselbar', async () => {
    const s = session(['a', 'b', 'c', 'd']);
    const tests = [
      test('t1', 'a', [{ [H]: 30, contraction_time: 0.9 }]),
      test('t2', 'b', [{ [H]: 40, contraction_time: 0.7 }]),
      test('t3', 'c', [{ [H]: 30, contraction_time: 0.8 }]),
    ];
    render(<Leaderboard session={s} profiles={people} tests={tests} />);
    const rows = within(screen.getByTestId('board-rows')).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-rank'))).toEqual(['1', '2', '2', '']);
    expect(rows[0]).toHaveTextContent('Person B');
    expect(rows[0]).toHaveTextContent('40,0 cm');
    expect(rows[3]).toHaveTextContent('Person D');
    expect(rows[3]).toHaveTextContent('wartet');
    // Kennzahl: Kontraktionszeit – Richtung nicht festgelegt → „höher zuerst“; mit „umkehren“ gewinnt die kürzeste Zeit
    await userEvent.selectOptions(screen.getByTestId('board-metric'), 'contraction_time');
    const after = within(screen.getByTestId('board-rows')).getAllByRole('listitem');
    expect(after[0]).toHaveTextContent('Person A');
    await userEvent.click(screen.getByLabelText('Reihenfolge umkehren'));
    expect(within(screen.getByTestId('board-rows')).getAllByRole('listitem')[0]).toHaveTextContent(
      'Person B',
    );
  });

  it('Wertung Letzter/Mittel; Auswahl wird über das Callback gemeldet; Testtypen nur die vorhandenen', async () => {
    const s = session(['a']);
    const tests = [
      test('t1', 'a', [{ [H]: 40 }], '2026-10-01T10:00:00.000Z'),
      test('t2', 'a', [{ [H]: 30 }], '2026-10-01T10:05:00.000Z'),
      test('t3', 'a', [{ jump_height_impmom: 50 }], '2026-10-01T10:06:00.000Z', 'sj'),
    ];
    const onBoardChange = vi.fn();
    render(<Leaderboard session={s} profiles={people} tests={tests} onBoardChange={onBoardChange} />);
    expect(screen.getByTestId('board-value-Person A')).toHaveTextContent('40,0 cm');
    await userEvent.selectOptions(screen.getByTestId('board-aggregate'), 'last');
    expect(screen.getByTestId('board-value-Person A')).toHaveTextContent('30,0 cm');
    expect(onBoardChange).toHaveBeenLastCalledWith({ aggregate: 'last' });
    await userEvent.selectOptions(screen.getByTestId('board-aggregate'), 'mean');
    expect(screen.getByTestId('board-value-Person A')).toHaveTextContent('35,0 cm');
    const types = within(screen.getByTestId('board-type'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(types).toHaveLength(2); // CMJ + SJ
    await userEvent.selectOptions(screen.getByTestId('board-type'), 'sj');
    expect(onBoardChange).toHaveBeenLastCalledWith({ testType: 'sj', metric: 'jump_height_impmom' });
    expect(screen.getByTestId('board-value-Person A')).toHaveTextContent('50,0 cm');
  });

  it('Asymmetrie: Betrag, kleiner ist besser, ohne Seitenangabe', async () => {
    const s = session(['a', 'b']);
    const tests = [
      test('t1', 'a', [{ asym_takeoff_peak_force: -8 }]),
      test('t2', 'b', [{ asym_takeoff_peak_force: 2 }]),
    ];
    render(
      <Leaderboard
        session={{ ...s, board: { ...s.board, metric: 'asym_takeoff_peak_force' } }}
        profiles={people}
        tests={tests}
      />,
    );
    const rows = within(screen.getByTestId('board-rows')).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Person B');
    expect(rows[0]).toHaveTextContent('2 %');
    expect(rows[1]).toHaveTextContent('8 %');
    expect(rows[1].textContent).not.toMatch(/[LR] 8/);
  });

  it('ohne Ergebnisse: Hinweis statt leerer Liste', () => {
    render(<Leaderboard session={session()} profiles={people} tests={[]} />);
    expect(screen.getByTestId('board-empty')).toBeInTheDocument();
  });
});

describe('Warteschlangen-Panel', () => {
  beforeEach(() => useSettings.setState({ lang: 'de' }));
  const actions = () => ({
    start: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
    skip: vi.fn(),
    requeue: vi.fn(),
    add: vi.fn(),
  });

  it('zeigt Status, Versuche und die passenden Aktionen; ruft die Callbacks', async () => {
    let s = session(['a', 'b', 'c']);
    s = setQueueStatus(setQueueStatus(s, 'a', 'testing'), 'b', 'done');
    s = setQueueStatus(s, 'c', 'skipped');
    const a = actions();
    render(
      <QueuePanel
        session={s}
        profiles={people}
        allProfiles={[...people.values(), { id: 'z', name: 'Zusatz' } as never]}
        tests={[test('t1', 'b', [{}]), test('t2', 'b', [{}])]}
        busy={false}
        actions={a}
      />,
    );
    expect(screen.getByTestId('queue-Person A')).toHaveAttribute('data-status', 'testing');
    expect(screen.getByTestId('queue-Person B')).toHaveTextContent('2 Tests');
    expect(screen.queryByTestId('queue-start-Person A')).toBeNull(); // der aktuelle wird nicht „gestartet“
    expect(screen.getByTestId('queue-remove-Person A')).toBeDisabled();
    await userEvent.click(screen.getByTestId('queue-start-Person B')); // Erneut testen
    expect(a.start).toHaveBeenCalledWith('b');
    await userEvent.click(screen.getByRole('button', { name: 'Wieder einreihen' }));
    expect(a.requeue).toHaveBeenCalledWith('c');
    await userEvent.click(screen.getByTestId('queue-down-Person A'));
    expect(a.move).toHaveBeenCalledWith('a', 1);
    expect(screen.getByTestId('queue-up-Person A')).toBeDisabled();
    await userEvent.selectOptions(screen.getByTestId('queue-add-select'), 'z');
    await userEvent.click(screen.getByTestId('queue-add'));
    expect(a.add).toHaveBeenCalledWith('z');
  });

  it('während der Aufnahme sind Athletenwechsel gesperrt; pausierte Session erlaubt keinen Start', () => {
    const s = session(['a', 'b']);
    const a = actions();
    const { rerender } = render(
      <QueuePanel session={s} profiles={people} allProfiles={[]} tests={[]} busy actions={a} />,
    );
    expect(screen.getByTestId('queue-start-Person A')).toBeDisabled();
    rerender(
      <QueuePanel
        session={{ ...s, status: 'paused' }}
        profiles={people}
        allProfiles={[]}
        tests={[]}
        busy={false}
        actions={a}
      />,
    );
    expect(screen.queryByTestId('queue-start-Person A')).toBeNull();
  });
});

describe('CSV-Export', () => {
  it('eine Zeile je eingeschlossener Wiederholung (ohne Lead-in), Spalten aus der Registry, Gäste benannt', () => {
    const t1 = test('t1', 'a', [
      { jump_height_impmom: 30, contraction_time: 0.8 },
      { jump_height_impmom: 35 },
    ]);
    t1.reps[1]!.included = false;
    const t2 = test('t2', null, [{ jump_height_impmom: 40 }], '2026-10-01T10:01:00.000Z');
    const csv = sessionResultsCsv([t2, t1], people, 'de');
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Athlet;Testtyp;Zeit;Wdh\.;/);
    expect(lines[0]).toContain('Sprunghöhe (Imp-Mom) [cm]');
    expect(lines).toHaveLength(3); // Kopf + 1 eingeschlossene Rep + Gast
    expect(lines[1]).toContain('Person A;Gegenbewegungssprung');
    expect(lines[2]).toContain('Gast;');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    // Werte in den Registry-Einheiten (cm), Dezimalkomma wegen Semikolon-Format
    expect(lines[1]).toContain(';30;');
  });
});

describe('Sessions-Seite', () => {
  beforeEach(async () => {
    await resetDbForTests();
    localStorage.clear();
    useSettings.setState({ lang: 'de' });
    useAuth.setState({
      status: 'authenticated',
      me: {
        id: 'u',
        name: 'T',
        email: 't@x',
        role: 'admin',
        groupScope: 'all',
        organization: { id: 'o', name: 'O' },
        access: [],
      },
    });
    vi.spyOn(syncEngine, 'run').mockResolvedValue(syncEngine.state);
    await localRepo.categories.put({ id: 'c1', name: 'Teams' });
    await localRepo.groups.put({ id: 'g1', categoryId: 'c1', name: 'U19' });
    for (const n of ['Anna', 'Ben'])
      await localRepo.profiles.put({
        id: `p-${n}`,
        name: n,
        groupIds: ['g1'],
        dateOfBirth: null,
        sex: null,
        heightCm: null,
        weightKg: 70,
        sport: null,
        email: null,
        notes: null,
        externalId: null,
        allowPhotoVideo: false,
        guardianConsent: false,
        healthConsentAt: 'x',
        createdAt: 'x',
        updatedAt: 'x',
      });
  });

  const renderPage = () => {
    let path = '';
    render(
      <MemoryRouter initialEntries={['/session']}>
        <Routes>
          <Route path="/session" element={<SessionsPage />} />
          <Route path="/session/:id" element={<span data-testid="opened">{(path = 'opened')}</span>} />
        </Routes>
      </MemoryRouter>,
    );
    return () => path;
  };

  it('Ganze Gruppe wählen → Session anlegen: lokal gespeichert, in der Warteschlange für den Upload, Navigation', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'U19' });
    await user.selectOptions(screen.getByTestId('session-group'), 'g1');
    await user.click(screen.getByTestId('session-add-group'));
    expect(screen.getByTestId('session-picked-count')).toHaveTextContent('2 Athleten');
    await user.type(screen.getByTestId('session-name-input'), 'Montag');
    await user.click(screen.getByTestId('session-create'));
    expect(await screen.findByTestId('opened')).toBeInTheDocument();
    const [s] = await localRepo.sessions.list();
    expect(s).toMatchObject({ name: 'Montag', mode: 'cmj', status: 'active', groupId: 'g1' });
    expect(s!.queue.map((q) => q.profileId).sort()).toEqual(['p-Anna', 'p-Ben']);
    expect((await localRepo.outbox.list()).map((o) => o.kind)).toContain('session');
  });

  it('Einzelne Athleten per Suche hinzufügen und wieder entfernen; ohne Athleten ist „Starten“ gesperrt', async () => {
    renderPage();
    const user = userEvent.setup();
    expect(await screen.findByTestId('session-create')).toBeDisabled();
    await user.type(screen.getByTestId('session-search'), 'be');
    await user.click(screen.getByTestId('session-pick-Ben'));
    expect(screen.getByTestId('session-picked-count')).toHaveTextContent('1 Athleten');
    expect(screen.getByTestId('session-create')).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /Entfernen: Ben/ }));
    expect(screen.getByTestId('session-create')).toBeDisabled();
  });

  it('Demo: legt 10 Athleten an und startet eine CMJ-Session', async () => {
    renderPage();
    await userEvent.click(await screen.findByTestId('session-demo'));
    expect(await screen.findByTestId('opened')).toBeInTheDocument();
    expect((await localRepo.profiles.list()).filter((p) => p.sport === 'Demo')).toHaveLength(10);
    const [s] = await localRepo.sessions.list();
    expect(s!.queue).toHaveLength(10);
    expect(s!.mode).toBe('cmj');
  });

  it('Löschen: Session weg (Tests bleiben), offene Uploads der Session verfallen', async () => {
    const s = session(['p-Anna']);
    await localRepo.sessions.put(s);
    await localRepo.outbox.add('session', s.id);
    await localRepo.tests.put(test('t1', 'p-Anna', [{}]));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    await user.click(screen.getByTestId('confirm-yes'));
    await vi.waitFor(async () => expect(await localRepo.sessions.get(s.id)).toBeUndefined());
    expect((await localRepo.outbox.list()).filter((o) => o.kind === 'session')).toHaveLength(0);
    expect(await localRepo.tests.get('t1')).toBeDefined();
  });
});
