import { describe, expect, it } from 'vitest';
import {
  detectColumns,
  normalizeHeader,
  parseDob,
  parseSex,
  planProfileImport,
  profilesToCsv,
  type GroupDTO,
  type PlanOptions,
  type ProfileDTO,
} from '../src/index.ts';

const NOW = '2026-10-01T10:00:00.000Z';
const TODAY = new Date('2026-10-01T10:00:00Z');
let n = 0;
const groups: GroupDTO[] = [
  { id: 'g-u19', categoryId: 'c', name: 'U19' },
  { id: 'g-pro', categoryId: 'c', name: 'Profis' },
];
const base = (over: Partial<PlanOptions> = {}): PlanOptions => ({
  existing: [],
  groups,
  now: NOW,
  today: TODAY,
  newId: () => `new-${++n}`,
  defaultGroupIds: ['g-u19'],
  ...over,
});
const existing = (over: Partial<ProfileDTO>): ProfileDTO => ({
  id: 'p-1',
  name: 'Anna Berger',
  dateOfBirth: '2001-05-17',
  sex: 'f',
  heightCm: 170,
  weightKg: 62,
  sport: 'Handball',
  email: null,
  notes: null,
  externalId: 'M-100',
  allowPhotoVideo: false,
  guardianConsent: false,
  healthConsentAt: NOW,
  groupIds: ['g-pro'],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

describe('Spaltenerkennung', () => {
  it('normalisiert Umlaute/Sonderzeichen und erkennt deutsche und englische Köpfe', () => {
    expect(normalizeHeader('Größe (cm)')).toBe('groessecm');
    expect(
      detectColumns([
        'Vorname',
        'Nachname',
        'Geburtsdatum',
        'Geschlecht',
        'Größe (cm)',
        'Gewicht (kg)',
        'E-Mail',
        'Gruppe',
        'Foo',
      ]),
    ).toEqual([
      'firstName',
      'lastName',
      'dateOfBirth',
      'sex',
      'heightCm',
      'weightKg',
      'email',
      'groups',
      'ignore',
    ]);
    expect(detectColumns(['Name', 'DOB', 'Sex', 'Height', 'Weight', 'Sport', 'Team', 'ID', 'Notes'])).toEqual(
      ['name', 'dateOfBirth', 'sex', 'heightCm', 'weightKg', 'sport', 'groups', 'externalId', 'notes'],
    );
  });
  it('ordnet jedes Feld höchstens einmal zu', () => {
    expect(detectColumns(['Name', 'Name', 'Gruppe'])).toEqual(['name', 'ignore', 'groups']);
  });
});

describe('Feldparser', () => {
  it('Geburtsdatum: ISO, dd.mm.yyyy, ungültige Kalendertage und 2-stellige Jahre werden abgelehnt', () => {
    expect(parseDob('2001-05-17')).toEqual({ value: '2001-05-17', ok: true });
    expect(parseDob('17.5.2001')).toEqual({ value: '2001-05-17', ok: true });
    expect(parseDob('2001/05/17')).toEqual({ value: '2001-05-17', ok: true });
    expect(parseDob('')).toEqual({ value: null, ok: true });
    expect(parseDob('31.02.2001').ok).toBe(false);
    expect(parseDob('17.05.01').ok).toBe(false);
    expect(parseDob('gestern').ok).toBe(false);
  });
  it('Geschlecht: m/w/f/d und Langformen', () => {
    expect(parseSex('weiblich').value).toBe('f');
    expect(parseSex('W').value).toBe('f');
    expect(parseSex('Männlich').value).toBe('m');
    expect(parseSex('divers').value).toBe('d');
    expect(parseSex('').ok).toBe(true);
    expect(parseSex('???').ok).toBe(false);
  });
});

describe('Importplan', () => {
  const csv = [
    'Vorname;Nachname;Geburtsdatum;Geschlecht;Größe;Gewicht;E-Mail;Gruppe;Mitgliedsnummer',
    'Anna;Berger;17.05.2001;w;1,70;62,5;anna@example.org;Profis;M-100',
    'Ben;Maier;03.11.2006;m;181;74;ben@example.org;U19;',
    'Clara;Neu;;;;;kaputt;Unbekannt;',
    ';;;;;;;U19;',
    'Dora;Dublette;01.01.2000;f;165;60;;U19;',
    'Dora;Dublette;01.01.2000;f;165;60;;U19;',
  ].join('\r\n');

  it('Excel-CSV (Semikolon, Dezimalkomma, Datum dd.mm.yyyy): erkennt neu/Update/ungültig/Duplikat in der Datei', () => {
    const plan = planProfileImport(csv, base({ existing: [existing({})] }));
    expect(plan.delimiter).toBe(';');
    expect(plan.fatal).toBeNull();
    const by = (i: number) => plan.rows[i]!;
    // Anna: über externalId zugeordnet, Gewicht/Größe aktualisiert, Gruppen vereinigt
    expect(by(0)).toMatchObject({ status: 'update', matchedBy: 'externalId', line: 2 });
    expect(by(0).profile).toMatchObject({
      id: 'p-1',
      heightCm: 170,
      weightKg: 62.5,
      email: 'anna@example.org',
      groupIds: ['g-pro'],
    });
    // Ben: neu, Größe in cm
    expect(by(1)).toMatchObject({ status: 'new' });
    expect(by(1).profile).toMatchObject({
      name: 'Ben Maier',
      sex: 'm',
      dateOfBirth: '2006-11-03',
      groupIds: ['g-u19'],
      createdAt: NOW,
    });
    // Clara: unbekannte Gruppe → Fehler; ungültige E-Mail nur Warnung
    expect(by(2).status).toBe('invalid');
    expect(by(2).issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['group_unknown', 'email_invalid']),
    );
    // leerer Name
    expect(by(3).status).toBe('invalid');
    expect(by(3).issues.map((i) => i.code)).toContain('name_required');
    // Dublette: erste neu, zweite Fehler
    expect(by(4).status).toBe('new');
    expect(by(5).status).toBe('invalid');
    expect(by(5).issues.map((i) => i.code)).toContain('duplicate_in_file');
    expect(plan.summary).toMatchObject({ new: 2, update: 1, invalid: 3, unchanged: 0, total: 6 });
  });

  it('Zuordnung über Name + Geburtsdatum ohne externalId; unveränderte Zeilen sind „unchanged“', () => {
    const e = existing({ externalId: null });
    const plan = planProfileImport(
      'name,dob,groups\nAnna Berger,2001-05-17,Profis\n',
      base({ existing: [e] }),
    );
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', matchedBy: 'nameDob' });
    const plan2 = planProfileImport(
      'name,dob,sport\nanna berger,17.05.2001,Volleyball\n',
      base({ existing: [e] }),
    );
    expect(plan2.rows[0]).toMatchObject({ status: 'update', matchedBy: 'nameDob' });
    expect(plan2.rows[0]!.profile!.sport).toBe('Volleyball');
    // gleicher Name ohne Geburtsdatum wird NICHT automatisch zusammengeführt (Namensvetter)
    const plan3 = planProfileImport('name,groups\nAnna Berger,U19\n', base({ existing: [e] }));
    expect(plan3.rows[0]!.status).toBe('new');
  });

  it('Update überschreibt nie mit leeren Feldern und entfernt keine Gruppen', () => {
    const e = existing({ sport: 'Handball', notes: 'wichtig' });
    const plan = planProfileImport(
      'name;dob;sport;notes;group\nAnna Berger;17.05.2001;;;U19\n',
      base({ existing: [e] }),
    );
    expect(plan.rows[0]!.profile).toMatchObject({ sport: 'Handball', notes: 'wichtig' });
    expect(plan.rows[0]!.profile!.groupIds.sort()).toEqual(['g-pro', 'g-u19']);
  });

  it('Standardgruppe für Zeilen ohne Gruppe; ohne Standard → Pflichtfehler', () => {
    expect(planProfileImport('name\nEmil\n', base()).rows[0]!.profile!.groupIds).toEqual(['g-u19']);
    const plan = planProfileImport('name\nEmil\n', base({ defaultGroupIds: [] }));
    expect(plan.rows[0]!.status).toBe('invalid');
    expect(plan.rows[0]!.issues.map((i) => i.code)).toContain('group_required');
  });

  it('Fehlende Gruppen automatisch anlegen: werden gemeldet, Zeilen bleiben gültig', () => {
    const plan = planProfileImport(
      'name,group\nFelix,"Neue Gruppe, U19"\nGina,Neue Gruppe\n',
      base({ createMissingGroups: true }),
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'new']);
    expect(plan.rows[0]!.newGroups).toEqual(['Neue Gruppe']);
    expect(plan.rows[0]!.profile!.groupIds).toEqual(['g-u19']);
    expect(plan.summary.newGroups).toEqual(['Neue Gruppe']);
  });

  it('Plausibilität und Minderjährige: Größe in Metern wird umgerechnet, Bereichsfehler, Einwilligung', () => {
    const plan = planProfileImport(
      'name,height,weight,dob,consent\nHugo,1.82,80,2000-01-01,ja\nIda,17,70,2000-01-01,\nJan,180,5,2000-01-01,nein\n',
      base({ columns: ['name', 'heightCm', 'weightKg', 'dateOfBirth', 'healthConsent'] }),
    );
    expect(plan.rows[0]!.profile).toMatchObject({ heightCm: 182, healthConsentAt: NOW });
    expect(plan.rows[0]!.issues.map((i) => i.code)).toContain('height_converted');
    expect(plan.rows[1]!.status).toBe('invalid');
    expect(plan.rows[1]!.issues.map((i) => i.code)).toContain('height_range');
    expect(plan.rows[2]!.status).toBe('invalid');
    expect(plan.rows[2]!.issues.map((i) => i.code)).toContain('weight_range');
    expect(plan.rows[0]!.profile!.healthConsentAt).toBe(NOW);
  });

  it('Tab-getrennt, BOM, Anführungszeichen mit Trennzeichen im Feld', () => {
    const plan = planProfileImport('﻿Name\tNotizen\n"Lang, Lena"\t"Zeile ""eins"""\n', base());
    expect(plan.delimiter).toBe('\t');
    expect(plan.rows[0]!.profile).toMatchObject({ name: 'Lang, Lena', notes: 'Zeile "eins"' });
  });

  it('Schwere Fälle: keine Datenzeilen, keine Namensspalte', () => {
    expect(planProfileImport('name,group\n', base()).fatal).toBe('no_rows');
    expect(planProfileImport('sport,group\nHandball,U19\n', base()).fatal).toBe('no_name_column');
    // manuelle Zuordnung rettet eine Datei ohne erkennbare Köpfe
    const plan = planProfileImport('Spalte A,Spalte B\nOtto,Sport\n', base({ columns: ['name', 'sport'] }));
    expect(plan.fatal).toBeNull();
    expect(plan.rows[0]!.profile).toMatchObject({ name: 'Otto', sport: 'Sport' });
  });

  it('updateExisting = false: vorhandene Profile bleiben unverändert', () => {
    const plan = planProfileImport(
      'name,dob,sport\nAnna Berger,2001-05-17,Neu\n',
      base({ existing: [existing({})], updateExisting: false }),
    );
    expect(plan.rows[0]!.status).toBe('unchanged');
  });
});

describe('Export', () => {
  it('Round-Trip: Export → Import ergibt „unchanged“; Formelzeichen werden entschärft', () => {
    const ps = [
      existing({}),
      existing({
        id: 'p-2',
        name: '=HYPERLINK("x")',
        externalId: 'M-2',
        dateOfBirth: '1999-02-03',
        groupIds: ['g-u19', 'g-pro'],
        notes: 'a;b "c"',
      }),
    ];
    const csv = profilesToCsv(ps, groups);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=HYPERLINK");
    const plan = planProfileImport(csv, base({ existing: ps }));
    expect(plan.summary.invalid).toBe(0);
    expect(plan.rows.map((r) => r.status)).toEqual(['unchanged', 'unchanged']);
  });
});
