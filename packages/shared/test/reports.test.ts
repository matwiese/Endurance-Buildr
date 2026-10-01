import { describe, expect, it } from 'vitest';
import {
  aggregateValues,
  buildProgress,
  buildReport,
  reportToRows,
  statsOf,
  type GroupDTO,
  type NormRow,
  type ProfileDTO,
  type ReportOptions,
  type ReportTest,
} from '../src/index.ts';

const H = 'jump_height_impmom';
const profile = (id: string, over: Partial<ProfileDTO> = {}): ProfileDTO => ({
  id,
  name: `P ${id}`,
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
const test = (
  profileId: string | null,
  vals: Array<Record<string, number | null>>,
  createdAt: string,
  testType = 'cmj',
): ReportTest => ({
  id: `t${n++}`,
  profileId,
  testType,
  createdAt,
  reps: vals.map((metrics, index) => ({ index, included: true, metrics })),
});
const groups: GroupDTO[] = [
  { id: 'g1', categoryId: 'c', name: 'U19' },
  { id: 'g2', categoryId: 'c', name: 'Profis' },
];
const base = (o: Partial<ReportOptions> = {}): ReportOptions => ({
  testType: 'cmj',
  metrics: [H, 'contraction_time'],
  aggregate: 'best',
  mode: 'value',
  ...o,
});

describe('Aggregation', () => {
  it('Bester nach Richtung der Metrik, Letzter, Mittel; Asymmetrie → kleinster Betrag; leer → null', () => {
    expect(aggregateValues([30, 40, 35], H, 'best')).toBe(40);
    expect(aggregateValues([30, 40, 35], H, 'last')).toBe(35);
    expect(aggregateValues([30, 40, 35], H, 'mean')).toBe(35);
    expect(aggregateValues([-8, 3, -1], 'asym_takeoff_peak_force', 'best')).toBe(-1);
    expect(aggregateValues([], H, 'best')).toBeNull();
    expect(statsOf([1, 2, 3])).toMatchObject({ n: 3, mean: 2, sd: 1, min: 1, max: 3 });
    expect(statsOf([5])).toMatchObject({ n: 1, mean: 5, sd: null });
  });
});

describe('Bericht', () => {
  const people = [
    profile('a'),
    profile('b'),
    profile('c', { groupIds: ['g2'] }),
    profile('d', { groupIds: ['g1', 'g2'] }),
  ];
  const tests = [
    test('a', [{ [H]: 30 }, { [H]: 34 }], '2026-01-10T10:00:00Z'),
    test('a', [{ [H]: 36 }], '2026-03-10T10:00:00Z'),
    test('b', [{ [H]: 40 }], '2026-03-11T10:00:00Z'),
    test('c', [{ [H]: 50 }], '2026-03-12T10:00:00Z'),
    test('d', [{ [H]: 45 }], '2026-03-12T11:00:00Z'),
    test('b', [{ [H]: 99 }], '2026-03-11T10:00:00Z', 'sj'), // anderer Testtyp
    test(null, [{ [H]: 77 }], '2026-03-11T10:00:00Z'), // Gast
  ];

  it('Wert-Modus: bester Wert im Zeitraum, Teamstatistik über Athleten, nur Athleten mit Tests', () => {
    const r = buildReport(
      tests,
      people,
      groups,
      base({ from: '2026-03-01T00:00:00Z', to: '2026-03-31T23:59:59Z' }),
    );
    expect(r.rows.map((x) => [x.name, x.cells[H]!.value])).toEqual([
      ['P a', 36],
      ['P b', 40],
      ['P c', 50],
      ['P d', 45],
    ]);
    expect(r.stats[H]).toMatchObject({ n: 4, mean: 42.75, min: 36, max: 50 });
    expect(r.stats['contraction_time']!.n).toBe(0);
    // ohne Zeitraum zählt der beste Wert über alle Tests (a: 36)
    expect(buildReport(tests, people, groups, base()).rows[0]!.cells[H]!.value).toBe(36);
    expect(
      buildReport(tests, people, groups, base({ aggregate: 'mean' })).rows[0]!.cells[H]!.value,
    ).toBeCloseTo(33.3333, 3);
  });

  it('Gruppen- und Athletenfilter; Gruppenvergleich zählt Mehrfachmitglieder in jeder Gruppe', () => {
    const all = buildReport(tests, people, groups, base());
    const g = Object.fromEntries(all.groups.map((x) => [x.name, x]));
    expect(g['U19']!.n).toBe(3); // a, b, d
    expect(g['Profis']!.n).toBe(2); // c, d
    expect(g['Profis']!.perMetric[H]!.mean).toBe(47.5);
    const onlyPro = buildReport(tests, people, groups, base({ groupIds: ['g2'] }));
    expect(onlyPro.rows.map((x) => x.name)).toEqual(['P c', 'P d']);
    expect(buildReport(tests, people, groups, base({ profileIds: ['b'] })).rows).toHaveLength(1);
  });

  it('z-Score gegen das Team', () => {
    const r = buildReport(tests, people, groups, base({ mode: 'zTeam' }));
    const sd = r.stats[H]!.sd!;
    const mean = r.stats[H]!.mean!;
    expect(r.rows[2]!.cells[H]!.shown).toBeCloseTo((50 - mean) / sd, 9);
    expect(r.rows.reduce((a, x) => a + x.cells[H]!.shown!, 0)).toBeCloseTo(0, 9);
    // ein einzelner Athlet → keine Streuung → null
    expect(
      buildReport(tests, people, groups, base({ mode: 'zTeam', profileIds: ['a'] })).rows[0]!.cells[H]!.shown,
    ).toBeNull();
  });

  it('% Änderung gegenüber dem Vergleichszeitraum (Mittel); fehlt die Basis → null', () => {
    const r = buildReport(
      tests,
      people,
      groups,
      base({
        mode: 'pctChange',
        from: '2026-03-01T00:00:00Z',
        baseline: { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' },
      }),
    );
    // a: Basis = Mittel(30, 34) = 32 → 36 ⇒ +12,5 %
    expect(r.rows[0]!.cells[H]!.shown).toBeCloseTo(12.5, 9);
    expect(r.rows[1]!.cells[H]!.shown).toBeNull();
  });

  it('z-Score gegen eigene Norm: Alter zum Testzeitpunkt, Perzentil und Einordnung', () => {
    const norms: NormRow[] = [
      {
        testType: 'cmj',
        metric: H,
        sex: 'f',
        ageMin: 20,
        ageMax: 30,
        sport: null,
        n: null,
        mean: 30,
        sd: 5,
        pct: {},
      },
    ];
    const r = buildReport(
      tests,
      people,
      groups,
      base({ mode: 'zNorm', norms, from: '2026-03-01T00:00:00Z' }),
    );
    const a = r.rows[0]!.cells[H]!; // Wert 36 → z = 1,2
    expect(a.shown).toBeCloseTo(1.2, 9);
    expect(a.band).toBe('higher');
    expect(a.percentile).toBeCloseTo(88.5, 1);
    // ohne passende Norm (Alter außerhalb) → null
    const young = [profile('a', { dateOfBirth: '2015-01-01' })];
    expect(
      buildReport(tests, young, groups, base({ mode: 'zNorm', norms })).rows[0]!.cells[H]!.shown,
    ).toBeNull();
  });

  it('höchstens 20 Kennzahlen; CSV-Zeilen mit Statistik', () => {
    const many = Array.from({ length: 30 }, (_, i) => `m${i}`);
    expect(buildReport(tests, people, groups, base({ metrics: many })).options.metrics).toHaveLength(20);
    const rows = reportToRows(buildReport(tests, people, groups, base()), (m) => m, {
      athlete: 'Athlet',
      tests: 'Tests',
      mean: 'Mittel',
      sd: 'SD',
      min: 'Min',
      max: 'Max',
    });
    expect(rows[0]).toEqual(['Athlet', 'Tests', H, 'contraction_time']);
    expect(rows).toHaveLength(1 + 4 + 4);
    expect(rows[5]![0]).toBe('Mittel');
  });
});

describe('Verlauf', () => {
  const p = profile('a');
  const tests = [
    test('a', [{ [H]: 30 }], '2026-01-01T10:00:00Z'),
    test('a', [{ [H]: 32 }, { [H]: 34 }], '2026-02-01T10:00:00Z'),
    test('a', [{ [H]: 31 }], '2026-03-01T10:00:00Z'),
    test('a', [{ [H]: 38 }], '2026-04-01T10:00:00Z'),
    test('b', [{ [H]: 99 }], '2026-04-01T10:00:00Z'),
  ];
  it('Punkte je Test, Baseline = Mittel der ersten 3 Tests, Änderung des letzten Tests', () => {
    const pr = buildProgress(tests, p, { testType: 'cmj', metric: H, aggregate: 'best' });
    expect(pr.points.map((x) => x.value)).toEqual([30, 34, 31, 38]);
    expect(pr.baseline).toBeCloseTo(31.6667, 3);
    expect(pr.baselineCount).toBe(3);
    expect(pr.changePct).toBeCloseTo(20.0, 0);
  });
  it('Baseline als Zeitfenster; Norm-Einordnung je Punkt', () => {
    const norms: NormRow[] = [
      {
        testType: 'cmj',
        metric: H,
        sex: null,
        ageMin: null,
        ageMax: null,
        sport: null,
        n: null,
        mean: 32,
        sd: 4,
        pct: {},
      },
    ];
    const pr = buildProgress(tests, p, {
      testType: 'cmj',
      metric: H,
      aggregate: 'mean',
      baseline: { from: '2026-01-15T00:00:00Z', to: '2026-02-15T00:00:00Z' },
      norms,
    });
    expect(pr.baseline).toBe(33); // Mittel der Wiederholungen von Februar (32, 34) → je Test aggregiert = 33
    expect(pr.points[3]!.z).toBeCloseTo(1.5, 9);
    expect(pr.norm?.mean).toBe(32);
  });
  it('ohne Daten: leer', () => {
    const pr = buildProgress([], p, { testType: 'cmj', metric: H, aggregate: 'best' });
    expect(pr).toMatchObject({ points: [], baseline: null, changePct: null, norm: null });
  });
});
