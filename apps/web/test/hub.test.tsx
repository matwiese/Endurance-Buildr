import type { GroupDTO, MeDTO, ProfileDTO } from '@buildr/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bulkGroup, createTagOffline, removeProfile, saveProfile } from '../src/hub/services.ts';
import { resetDbForTests } from '../src/offline/db.ts';
import { localRepo } from '../src/offline/repo.ts';
import { HubHome } from '../src/pages/hub/HubHome.tsx';
import { useAuth } from '../src/state/auth.ts';
import { useSettings } from '../src/state/settings.ts';
import { syncEngine } from '../src/sync/index.ts';
import type * as FormatModule from '../src/lib/format.ts';

const download = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/format.ts', async (orig) => ({
  ...(await orig<typeof FormatModule>()),
  download,
}));

const GROUPS: GroupDTO[] = [
  { id: 'g-u19', categoryId: 'c1', name: 'U19' },
  { id: 'g-pro', categoryId: 'c1', name: 'Profis' },
];
const prof = (over: Partial<ProfileDTO>): ProfileDTO => ({
  id: crypto.randomUUID(),
  name: 'X',
  dateOfBirth: '2000-01-01',
  sex: 'f',
  heightCm: 170,
  weightKg: 65,
  sport: 'Handball',
  email: null,
  notes: null,
  externalId: null,
  allowPhotoVideo: false,
  guardianConsent: false,
  healthConsentAt: '2026-01-01T00:00:00.000Z',
  groupIds: ['g-u19'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const me = (role: MeDTO['role']): MeDTO => ({
  id: 'u1',
  name: 'T',
  email: 't@x.test',
  role,
  groupScope: 'all',
  organization: { id: 'o', name: 'O' },
  access: [],
});

async function seed(list: ProfileDTO[] = []) {
  await localRepo.categories.put({ id: 'c1', name: 'Teams' });
  for (const g of GROUPS) await localRepo.groups.put(g);
  for (const p of list) await localRepo.profiles.put(p);
}

const renderHub = (path = '/hub/athletes') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/hub/*" element={<HubHome />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Hub – Services', () => {
  beforeEach(async () => {
    await resetDbForTests();
    localStorage.clear();
    useAuth.setState({ status: 'authenticated', me: me('admin') });
    vi.spyOn(syncEngine, 'run').mockResolvedValue(syncEngine.state);
  });

  it('saveProfile: lokal speichern + Outbox (Servermodus), im lokalen Modus ohne Outbox', async () => {
    const p = prof({ name: 'Anna' });
    await saveProfile(p);
    expect((await localRepo.profiles.get(p.id))!.updatedAt).not.toBe(p.updatedAt);
    expect((await localRepo.outbox.list()).map((o) => [o.kind, o.entityId])).toEqual([['profile', p.id]]);
    expect(syncEngine.run).toHaveBeenCalled();
    useAuth.setState({ status: 'local', me: null });
    const q = prof({ name: 'Ben' });
    await saveProfile(q);
    expect(await localRepo.outbox.count()).toBe(1);
  });

  it('bulkGroup: hinzufügen/entfernen; Profile behalten mindestens eine Gruppe', async () => {
    const a = prof({ name: 'A', groupIds: ['g-u19'] });
    const b = prof({ name: 'B', groupIds: ['g-u19', 'g-pro'] });
    const add = await bulkGroup([a, b], 'g-pro', 'add');
    expect(add).toEqual({ changed: 1, skipped: 0 });
    expect((await localRepo.profiles.get(a.id))!.groupIds.sort()).toEqual(['g-pro', 'g-u19']);
    const rem = await bulkGroup([a, b], 'g-u19', 'remove');
    expect(rem).toEqual({ changed: 1, skipped: 1 }); // b hat noch g-pro → ok; a (lokal unverändert, 1 Gruppe im Argument) → übersprungen
  });

  it('removeProfile: lokale Tests/Aufnahmen weg, Änderungen verfallen, Löschung wird vorgemerkt', async () => {
    const p = prof({ name: 'Weg' });
    await localRepo.profiles.put(p);
    await localRepo.outbox.add('profile', p.id);
    await localRepo.tests.put({ id: 't1', profileId: p.id, recordingId: 'r1' } as never);
    await localRepo.recordings.put({ id: 'r1' } as never);
    await removeProfile(p.id);
    expect(await localRepo.profiles.get(p.id)).toBeUndefined();
    expect(await localRepo.tests.get('t1')).toBeUndefined();
    expect(await localRepo.recordings.get('r1')).toBeUndefined();
    expect((await localRepo.outbox.list()).map((o) => o.kind)).toEqual(['delete-profile']);
  });

  it('createTagOffline legt Tag-Typ und Tag an (dedupliziert) und merkt sie zum Upload vor', async () => {
    const t1 = await createTagOffline('Phase', 'Vorsaison');
    const t2 = await createTagOffline('phase', 'vorsaison');
    expect(t2!.id).toBe(t1!.id);
    expect(await localRepo.tagTypes.list()).toHaveLength(1);
    expect((await localRepo.outbox.list()).map((o) => o.kind).sort()).toEqual(['tag', 'tagType']);
    expect(await createTagOffline(' ', 'x')).toBeNull();
  });
});

describe('Hub – Athletenliste', () => {
  beforeEach(async () => {
    await resetDbForTests();
    localStorage.clear();
    download.mockClear();
    useSettings.setState({ lang: 'de' });
    useAuth.setState({ status: 'authenticated', me: me('admin') });
    vi.spyOn(syncEngine, 'run').mockResolvedValue(syncEngine.state);
  });

  it('zeigt Gruppen, Alter, Sucht und Filtert', async () => {
    await seed([
      prof({ name: 'Anna Berger', sport: 'Handball', externalId: 'M-1', groupIds: ['g-u19'] }),
      prof({ name: 'Ben Maier', sport: 'Fußball', groupIds: ['g-pro'] }),
      prof({ name: 'Clara Neu', sport: 'Handball', groupIds: ['g-u19', 'g-pro'], healthConsentAt: null }),
    ]);
    renderHub();
    const table = await screen.findByTestId('profiles-table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('3 Athleten', { exact: false })).toBeInTheDocument();
    expect(within(screen.getByTestId('profile-row-Clara Neu')).getByText('fehlt')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('profiles-search'), 'fußball');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    await user.clear(screen.getByTestId('profiles-search'));
    await user.type(screen.getByTestId('profiles-search'), 'm-1');
    expect(screen.getByTestId('profile-row-Anna Berger')).toBeInTheDocument();
    await user.clear(screen.getByTestId('profiles-search'));
    await user.selectOptions(screen.getByTestId('profiles-group-filter'), 'g-pro');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // Ben + Clara
  });

  it('sortiert nach Spalte und kehrt per Klick um', async () => {
    await seed([
      prof({ name: 'Bea', dateOfBirth: '2000-01-01' }),
      prof({ name: 'Zoe', dateOfBirth: '1990-01-01' }),
      prof({ name: 'Ada', dateOfBirth: '2010-01-01' }),
    ]);
    renderHub();
    const names = () =>
      within(screen.getByTestId('profiles-table'))
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.querySelector('td.font-semibold')!.textContent);
    await screen.findByTestId('profiles-table');
    expect(names()).toEqual(['Ada', 'Bea', 'Zoe']);
    await userEvent.click(screen.getByRole('button', { name: /^Name/ }));
    expect(names()).toEqual(['Zoe', 'Bea', 'Ada']);
    await userEvent.click(screen.getByRole('button', { name: /^Alter/ }));
    expect(names()).toEqual(['Ada', 'Bea', 'Zoe']); // jüngste zuerst (aufsteigend nach Alter)
  });

  it('Sammelzuweisung: auswählen → Gruppe → hinzufügen; Ergebnis wird gemeldet; Outbox gefüllt', async () => {
    const a = prof({ name: 'Anna', groupIds: ['g-u19'] });
    const b = prof({ name: 'Ben', groupIds: ['g-u19'] });
    await seed([a, b]);
    renderHub();
    const user = userEvent.setup();
    await screen.findByTestId('profiles-table');
    await user.click(screen.getByTestId('select-all'));
    expect(screen.getByText('2 ausgewählt')).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('bulk-group'), 'g-pro');
    await user.click(screen.getByTestId('bulk-add'));
    await waitFor(() =>
      expect(screen.getByTestId('bulk-result')).toHaveTextContent('2 geändert, 0 übersprungen'),
    );
    expect((await localRepo.profiles.get(a.id))!.groupIds).toContain('g-pro');
    expect((await localRepo.outbox.list()).filter((o) => o.kind === 'profile')).toHaveLength(2);
    // Entfernen aus der letzten Gruppe wird übersprungen
    await user.selectOptions(screen.getByTestId('bulk-group'), 'g-u19');
    await user.click(screen.getByTestId('bulk-remove'));
    await waitFor(() => expect(screen.getByTestId('bulk-result')).toHaveTextContent('2 geändert'));
  });

  it('Löschen verlangt das Bestätigungswort und ist nur für Administratoren sichtbar', async () => {
    const a = prof({ name: 'Anna' });
    await seed([a]);
    useAuth.setState({ status: 'authenticated', me: me('tester') });
    const { unmount } = renderHub();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Anna'));
    expect(screen.queryByTestId('bulk-delete')).toBeNull();
    expect(screen.getByTestId('bulk-add')).toBeInTheDocument(); // Tester dürfen zuweisen
    unmount();
    cleanupSelection();
    useAuth.setState({ status: 'authenticated', me: me('admin') });
    renderHub();
    await user.click(await screen.findByLabelText('Anna'));
    await user.click(screen.getByTestId('bulk-delete'));
    expect(screen.getByTestId('delete-confirm')).toBeDisabled();
    // user-event kann keine Nicht-ASCII-Zeichen tippen → Eingabe direkt setzen (Groß-/Kleinschreibung egal)
    fireEvent.change(screen.getByTestId('delete-word'), { target: { value: 'löschen' } });
    await user.click(screen.getByTestId('delete-confirm'));
    await waitFor(async () => expect(await localRepo.profiles.get(a.id)).toBeUndefined());
    expect((await localRepo.outbox.list()).map((o) => o.kind)).toContain('delete-profile');
  });

  it('Betrachter: nur lesen und exportieren (keine Neu/Import/Bearbeiten-Knöpfe)', async () => {
    await seed([prof({ name: 'Anna' })]);
    useAuth.setState({ status: 'authenticated', me: me('viewer') });
    renderHub();
    await screen.findByTestId('profiles-table');
    expect(screen.queryByTestId('hub-profile-new')).toBeNull();
    expect(screen.queryByTestId('profiles-import')).toBeNull();
    expect(screen.queryByTestId('profile-edit-Anna')).toBeNull();
    expect(screen.getByTestId('profiles-export')).toBeInTheDocument();
    expect(screen.queryByTestId('hub-nav-admin')).toBeNull();
  });

  it('Export: ausgewählte (sonst gefilterte) Athleten als CSV im Austauschformat', async () => {
    await seed([prof({ name: 'Anna', externalId: 'E1' }), prof({ name: 'Ben' })]);
    renderHub();
    const user = userEvent.setup();
    await screen.findByTestId('profiles-table');
    await user.click(screen.getByLabelText('Ben'));
    await user.click(screen.getByTestId('profiles-export'));
    expect(download).toHaveBeenCalledTimes(1);
    const [file, content] = download.mock.calls[0] as [string, string];
    expect(file).toBe('athleten.csv');
    expect(content).toContain('Ben');
    expect(content).not.toContain('Anna');
    expect(content).toContain('name;date_of_birth;sex');
  });

  it('Neu: Formular speichert lokal + Outbox', async () => {
    await seed([]);
    renderHub();
    const user = userEvent.setup();
    expect(await screen.findByTestId('profiles-empty')).toBeInTheDocument();
    await user.click(screen.getByTestId('hub-profile-new'));
    await user.type(screen.getByTestId('profile-name'), 'Neu Person');
    await user.click(screen.getByLabelText(/Einwilligung zur Verarbeitung/));
    await user.click(screen.getByRole('button', { name: /Speichern/ }));
    await waitFor(async () =>
      expect((await localRepo.profiles.list()).map((p) => p.name)).toEqual(['Neu Person']),
    );
    expect((await localRepo.outbox.list())[0]!.kind).toBe('profile');
  });
});

// Auswahl lebt im Komponentenzustand → nach unmount weg; Platzhalter für Lesbarkeit
const cleanupSelection = () => undefined;

describe('Hub – Navigation', () => {
  beforeEach(async () => {
    await resetDbForTests();
    useSettings.setState({ lang: 'de' });
    useAuth.setState({ status: 'authenticated', me: me('admin') });
  });

  it('Seitenleiste wechselt zwischen Athleten, Gruppen, Tags und Verwaltung (absolute Links, keine Pfadkette)', async () => {
    await seed([prof({ name: 'Anna' })]);
    const loc = { path: '' };
    function Probe() {
      loc.path = useLocation().pathname;
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/hub']}>
        <Probe />
        <Routes>
          <Route path="/hub/*" element={<HubHome />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await screen.findByTestId('profiles-table');
    expect(loc.path).toBe('/hub/athletes');
    await user.click(screen.getByTestId('hub-nav-groups'));
    expect(await screen.findByTestId('category-new')).toBeInTheDocument();
    expect(loc.path).toBe('/hub/groups');
    await user.click(screen.getByTestId('hub-nav-tags'));
    expect(await screen.findByTestId('tagtype-new')).toBeInTheDocument();
    expect(loc.path).toBe('/hub/tags');
    await user.click(screen.getByTestId('hub-nav-athletes'));
    expect(loc.path).toBe('/hub/athletes');
    await user.click(screen.getByTestId('hub-nav-athletes'));
    expect(loc.path).toBe('/hub/athletes');
  });

  it('Unbekannter Pfad führt zu den Athleten (keine Endlosschleife)', async () => {
    await seed([]);
    render(
      <MemoryRouter initialEntries={['/hub/gibt-es-nicht']}>
        <Routes>
          <Route path="/hub/*" element={<HubHome />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('profiles-empty')).toBeInTheDocument();
  });
});

describe('Hub – CSV-Import', () => {
  beforeEach(async () => {
    await resetDbForTests();
    localStorage.clear();
    download.mockClear();
    useSettings.setState({ lang: 'de' });
    useAuth.setState({ status: 'authenticated', me: me('admin') });
    vi.spyOn(syncEngine, 'run').mockResolvedValue(syncEngine.state);
  });

  const open = async () => {
    renderHub();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('profiles-import'));
    return user;
  };
  const paste = (text: string) =>
    fireEvent.change(screen.getByTestId('import-text'), { target: { value: text } });

  it('Trockenlauf zeigt Zusammenfassung und Prüfbericht; Import schreibt nur gültige Zeilen', async () => {
    await seed([prof({ name: 'Anna Berger', externalId: 'M-1', groupIds: ['g-pro'] })]);
    await open();
    paste(
      'Name;Geburtsdatum;Gruppe;Mitgliedsnummer\nAnna Berger;01.01.2000;U19;M-1\nBen Neu;02.02.2001;Profis;\nKaputt;31.02.2001;Profis;\n',
    );
    expect(screen.getByTestId('import-summary')).toHaveTextContent(
      '1 neu · 1 aktualisiert · 0 unverändert · 1 fehlerhaft',
    );
    const table = screen.getByTestId('import-table');
    expect(within(table).getByText(/Geburtsdatum ungültig: 31\.02\.2001/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('import-run'));
    expect(await screen.findByTestId('import-done')).toHaveTextContent('2 Athleten importiert');
    const all = await localRepo.profiles.list();
    expect(all.map((p) => p.name).sort()).toEqual(['Anna Berger', 'Ben Neu']);
    expect(all.find((p) => p.name === 'Anna Berger')!.groupIds.sort()).toEqual(['g-pro', 'g-u19']);
    expect((await localRepo.outbox.list()).filter((o) => o.kind === 'profile')).toHaveLength(2);
  });

  it('Spaltenzuordnung lässt sich korrigieren; fehlende Namensspalte wird gemeldet', async () => {
    await seed([]);
    await open();
    paste('Spalte A;Spalte B\nOtto;U19\n');
    expect(screen.getByTestId('import-fatal')).toHaveTextContent('Keine Namensspalte');
    await userEvent.selectOptions(screen.getByTestId('import-map-0'), 'name');
    await userEvent.selectOptions(screen.getByTestId('import-map-1'), 'groups');
    expect(screen.queryByTestId('import-fatal')).toBeNull();
    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 neu');
  });

  it('Unbekannte Gruppen: ohne Option Fehler, mit Option wird die Gruppe angelegt', async () => {
    await seed([]);
    await open();
    paste('Name;Gruppe\nFelix;Neue Truppe\n');
    expect(screen.getByTestId('import-summary')).toHaveTextContent('0 neu');
    await userEvent.click(screen.getByTestId('import-create-groups'));
    expect(screen.getByTestId('import-summary')).toHaveTextContent('1 neu');
    expect(screen.getByText(/Neue Gruppen: Neue Truppe/)).toBeInTheDocument();
    vi.spyOn(await import('../src/hub/services.ts').then((m) => m.refAdmin), 'saveGroup').mockImplementation(
      async (g) => {
        await localRepo.groups.put(g);
        return 'ok';
      },
    );
    await userEvent.click(screen.getByTestId('import-run'));
    await screen.findByTestId('import-done');
    const g = (await localRepo.groups.list()).find((x) => x.name === 'Neue Truppe')!;
    expect(g).toBeDefined();
    expect((await localRepo.profiles.list())[0]!.groupIds).toEqual([g.id]);
  });
});

void act;
