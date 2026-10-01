import { describe, expect, it } from 'vitest';
import {
  evaluateNorm,
  matchNorm,
  metricFrom,
  normalCdf,
  normTemplateCsv,
  planNormImport,
  type NormRow,
} from '../src/index.ts';

const row = (over: Partial<NormRow> = {}): NormRow => ({
  testType: 'cmj',
  metric: 'jump_height_impmom',
  sex: null,
  ageMin: null,
  ageMax: null,
  sport: null,
  n: null,
  mean: 30,
  sd: 5,
  pct: {},
  ...over,
});

describe('Normverteilung und Auswertung', () => {
  it('Φ: bekannte Werte', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it('z-Score, Perzentil (Normalverteilung) und Einordnung', () => {
    const e = evaluateNorm(35, row());
    expect(e.z).toBeCloseTo(1, 9);
    expect(e.percentile).toBeCloseTo(84.1, 1);
    expect(e.band).toBe('higher');
    expect(evaluateNorm(30, row()).band).toBe('average');
    expect(evaluateNorm(20, row()).band).toBe('much_lower');
    expect(evaluateNorm(41, row()).band).toBe('much_higher');
  });

  it('Perzentile aus der Tabelle werden linear interpoliert; außerhalb gilt die Normalverteilung nur als Rand', () => {
    const r = row({ pct: { 10: 24, 50: 30, 90: 36 } });
    expect(evaluateNorm(30, r).percentile).toBe(50);
    expect(evaluateNorm(27, r).percentile).toBe(30); // Mitte zwischen P10 (24) und P50 (30)
    expect(evaluateNorm(33, r).percentile).toBe(70);
    expect(evaluateNorm(20, r).percentile).toBeLessThanOrEqual(10);
    expect(evaluateNorm(40, r).percentile).toBeGreaterThanOrEqual(90);
    // ohne Mittel/SD nur Perzentile → z = null
    expect(evaluateNorm(30, row({ mean: null, sd: null, pct: { 10: 24, 50: 30, 90: 36 } })).z).toBeNull();
  });

  it('Zuordnung: spezifischste Zeile gewinnt (Sport > Geschlecht > Alter, schmaler Altersbereich)', () => {
    const rows = [
      row({ mean: 1 }),
      row({ mean: 2, sex: 'f' }),
      row({ mean: 3, sex: 'f', ageMin: 18, ageMax: 25 }),
      row({ mean: 4, sex: 'f', ageMin: 18, ageMax: 22 }),
      row({ mean: 5, sport: 'Handball' }),
      row({ mean: 6, testType: 'sj' }),
    ];
    const who = (sex: 'f' | 'm' | null, ageYears: number | null, sport: string | null) =>
      matchNorm(rows, { sex, ageYears, sport }, 'cmj', 'jump_height_impmom')?.mean;
    expect(who('m', 30, null)).toBe(1);
    expect(who('f', 40, null)).toBe(2);
    expect(who('f', 24, null)).toBe(3);
    expect(who('f', 20, null)).toBe(4); // schmalerer Altersbereich
    expect(who('f', 20, 'handball')).toBe(5); // Sport schlägt alles (Groß-/Kleinschreibung egal)
    expect(who(null, null, null)).toBe(1); // ohne Angaben nur die allgemeine Zeile
    expect(matchNorm(rows, { sex: 'f', ageYears: 20, sport: null }, 'cmj', 'unbekannt')).toBeNull();
  });
});

describe('Norm-CSV', () => {
  it('Metrik über Schlüssel oder Bezeichnung (de/en)', () => {
    expect(metricFrom('jump_height_impmom')).toBe('jump_height_impmom');
    expect(metricFrom('Sprunghöhe (Imp-Mom)')).toBe('jump_height_impmom');
    expect(metricFrom('nicht vorhanden')).toBeNull();
  });

  it('Import: Excel-Format, Synonyme, Perzentile, Prüfbericht', () => {
    const csv = [
      'Testtyp;Kennzahl;Geschlecht;Alter von;Alter bis;Sportart;n;Mittelwert;SD;P10;P50;P90',
      'cmj;Sprunghöhe (Imp-Mom);weiblich;18;25;Handball;120;28,4;4,1;;;',
      'Gegenbewegungssprung (CMJ);jump_height_impmom;m;18;25;;80;;;30;38;46',
      'xyz;jump_height_impmom;;;;;;30;4;;;',
      'cmj;gibt_es_nicht;;;;;;30;4;;;',
      'cmj;jump_height_impmom;q;;;;;30;4;;;',
      'cmj;jump_height_impmom;;30;20;;;30;4;;;',
      'cmj;jump_height_impmom;;;;;;30;0;;;',
      'cmj;jump_height_impmom;;;;;;;;;;',
      'cmj;jump_height_impmom;;;;;;30;4;40;30;50',
    ].join('\r\n');
    const plan = planNormImport(csv, new Map([['gegenbewegungssprungcmj', 'cmj']]));
    expect(plan.fatal).toBeNull();
    expect(plan.valid).toHaveLength(2);
    expect(plan.valid[0]).toMatchObject({
      testType: 'cmj',
      metric: 'jump_height_impmom',
      sex: 'f',
      ageMin: 18,
      ageMax: 25,
      sport: 'Handball',
      n: 120,
      mean: 28.4,
      sd: 4.1,
    });
    expect(plan.valid[1]!.pct).toEqual({ 10: 30, 50: 38, 90: 46 });
    const codes = plan.rows.slice(2).map((r) => r.issues.map((i) => i.code));
    expect(codes).toEqual([
      ['test_type_unknown'],
      ['metric_unknown'],
      ['sex_invalid'],
      ['age_range'],
      ['sd_invalid'],
      ['value_missing'],
      ['percentiles_order'],
    ]);
  });

  it('Doppelte Strata, fehlende Pflichtspalten, leere Datei', () => {
    const dup = 'test_type,metric,mean,sd\ncmj,jump_height_impmom,30,4\ncmj,jump_height_impmom,31,4\n';
    expect(planNormImport(dup).rows[1]!.issues.map((i) => i.code)).toEqual(['duplicate_stratum']);
    expect(planNormImport('a,b\n1,2\n').fatal).toBe('missing_columns');
    expect(planNormImport('test_type,metric\n').fatal).toBe('no_rows');
  });

  it('Vorlage enthält Kopfzeile und ein Beispiel, das sich importieren lässt', () => {
    const plan = planNormImport(normTemplateCsv());
    expect(plan.valid).toHaveLength(1);
    expect(plan.valid[0]!.sport).toBe('Beispielsport');
  });
});
