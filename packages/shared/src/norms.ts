import {
  TEST_TYPES,
  allMetrics,
  getMetric,
  parseCsvText,
  parseNumberLoose,
  detectDelimiter,
  stripBom,
  type TestType,
} from '@buildr/core';
import type { Sex } from './model.ts';

/**
 * Eigene Normwerte (Referenzdaten). Es werden **keine** Normdaten mitgeliefert – nur der Import eigener Normsets (CSV) mit Strata
 * nach Geschlecht, Altersklasse und Sport. Werte stehen in den Einheiten der Metrik-Registry (z. B. Sprunghöhe in cm).
 */
export interface NormRow {
  testType: TestType;
  metric: string;
  /** null = alle */
  sex: Sex | null;
  /** inklusive Altersgrenzen in Jahren, null = offen */
  ageMin: number | null;
  ageMax: number | null;
  /** null = alle Sportarten */
  sport: string | null;
  n: number | null;
  mean: number | null;
  sd: number | null;
  /** optionale Perzentile (5, 10, 25, 50, 75, 90, 95) */
  pct: Partial<Record<5 | 10 | 25 | 50 | 75 | 90 | 95, number>>;
}

export interface NormSetDTO {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  rows: NormRow[];
}

export const NORM_PERCENTILES = [5, 10, 25, 50, 75, 90, 95] as const;
export const NORM_CSV_HEADER = [
  'test_type',
  'metric',
  'sex',
  'age_min',
  'age_max',
  'sport',
  'n',
  'mean',
  'sd',
  ...NORM_PERCENTILES.map((p) => `p${p}`),
];

export type NormIssueCode =
  | 'test_type_unknown'
  | 'metric_unknown'
  | 'metric_not_for_test'
  | 'sex_invalid'
  | 'age_invalid'
  | 'age_range'
  | 'value_missing'
  | 'sd_invalid'
  | 'number_invalid'
  | 'percentiles_order'
  | 'duplicate_stratum';

export interface NormIssue {
  code: NormIssueCode;
  field?: string;
  value?: string;
}

export interface NormImportRow {
  line: number;
  row?: NormRow;
  issues: NormIssue[];
}

export interface NormImportPlan {
  rows: NormImportRow[];
  valid: NormRow[];
  invalid: number;
  fatal: 'no_rows' | 'missing_columns' | null;
  missing: string[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const TEST_BY_NAME = new Map<string, TestType>(TEST_TYPES.map((t) => [norm(t), t]));
function testTypeFrom(raw: string, labels: Map<string, TestType>): TestType | null {
  const n = norm(raw);
  return TEST_BY_NAME.get(n) ?? labels.get(n) ?? null;
}

/** Löst Metrik-Schlüssel oder (de/en) Bezeichnung auf. */
export function metricFrom(raw: string): string | null {
  const n = norm(raw);
  if (!n) return null;
  for (const m of allMetrics())
    if (norm(m.key) === n || norm(m.label.de) === n || norm(m.label.en) === n) return m.key;
  return null;
}

const SEX: Record<string, Sex> = {
  f: 'f',
  w: 'f',
  female: 'f',
  weiblich: 'f',
  m: 'm',
  male: 'm',
  maennlich: 'm',
  männlich: 'm',
  d: 'd',
  divers: 'd',
  x: 'd',
};

/** Passt der Datensatz (Geschlecht/Alter/Sport/Testtyp/Metrik) zu einer Normzeile? Spezifischste Zeile gewinnt. */
export function matchNorm(
  rows: ReadonlyArray<NormRow>,
  who: { sex: Sex | null; ageYears: number | null; sport: string | null },
  testType: string,
  metric: string,
): NormRow | null {
  let best: { row: NormRow; score: number } | null = null;
  for (const r of rows) {
    if (r.testType !== testType || r.metric !== metric) continue;
    if (r.sex !== null && r.sex !== who.sex) continue;
    if (r.ageMin !== null && (who.ageYears === null || who.ageYears < r.ageMin)) continue;
    if (r.ageMax !== null && (who.ageYears === null || who.ageYears > r.ageMax)) continue;
    if (r.sport !== null && (who.sport === null || r.sport.toLowerCase() !== who.sport.trim().toLowerCase()))
      continue;
    // Spezifität: Sport > Geschlecht > Alter (schmaler = besser)
    const span =
      r.ageMin !== null && r.ageMax !== null
        ? r.ageMax - r.ageMin
        : r.ageMin !== null || r.ageMax !== null
          ? 60
          : 200;
    const score =
      (r.sport !== null ? 1000 : 0) +
      (r.sex !== null ? 100 : 0) +
      (r.ageMin !== null || r.ageMax !== null ? 10 : 0) +
      (200 - Math.min(200, span)) / 100;
    if (!best || score > best.score) best = { row: r, score };
  }
  return best?.row ?? null;
}

/** Standardnormalverteilung (Φ), Abramowitz-Stegun-Näherung (|Fehler| < 1,5·10⁻⁷). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

export type NormBand = 'much_lower' | 'lower' | 'average' | 'higher' | 'much_higher';

export interface NormEvaluation {
  /** (Wert − Mittel) / SD (roh, Richtung des Werts) */
  z: number | null;
  /** Perzentil 0–100 des Werts (aus Perzentilen interpoliert, sonst Normalverteilung) */
  percentile: number | null;
  /** Einordnung des Werts relativ zur Norm (unabhängig davon, ob höher „besser“ ist) */
  band: NormBand | null;
}

export function evaluateNorm(value: number, row: NormRow): NormEvaluation {
  const z = row.mean !== null && row.sd !== null && row.sd > 0 ? (value - row.mean) / row.sd : null;
  const pts = NORM_PERCENTILES.flatMap((p) => (row.pct[p] !== undefined ? [{ p, v: row.pct[p]! }] : []));
  let percentile: number | null = null;
  if (pts.length >= 3) {
    const lo = pts[0]!;
    const hi = pts[pts.length - 1]!;
    if (value < lo.v) percentile = z !== null ? Math.min(lo.p, normalCdf(z) * 100) : lo.p;
    else if (value > hi.v) percentile = z !== null ? Math.max(hi.p, normalCdf(z) * 100) : hi.p;
    else {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        if (value <= b.v) {
          percentile = b.v === a.v ? b.p : a.p + ((b.p - a.p) * (value - a.v)) / (b.v - a.v);
          break;
        }
      }
    }
  } else if (z !== null) percentile = normalCdf(z) * 100;
  const band: NormBand | null =
    z === null
      ? null
      : z < -1.5
        ? 'much_lower'
        : z < -0.5
          ? 'lower'
          : z <= 0.5
            ? 'average'
            : z <= 1.5
              ? 'higher'
              : 'much_higher';
  return { z, percentile: percentile === null ? null : Math.round(percentile * 10) / 10, band };
}

const cleanNum = (raw: string | undefined): number | null => {
  const v = parseNumberLoose((raw ?? '').trim());
  return Number.isNaN(v) ? null : v;
};

/** CSV eines Normsets prüfen (Trockenlauf). Spalten über die Kopfzeile (Reihenfolge egal, Synonyme de/en). */
export function planNormImport(text: string, labels: Map<string, TestType> = new Map()): NormImportPlan {
  const body = stripBom(text);
  const table = parseCsvText(body, detectDelimiter(body)).filter((r) => r.some((c) => c.trim() !== ''));
  const empty: NormImportPlan = { rows: [], valid: [], invalid: 0, fatal: null, missing: [] };
  if (table.length < 2) return { ...empty, fatal: 'no_rows' };
  const header = table[0]!.map((h) => norm(h));
  const col = (...names: string[]): number => header.findIndex((h) => names.includes(h));
  const idx = {
    testType: col('testtype', 'test', 'testtyp'),
    metric: col('metric', 'kennzahl', 'metrik'),
    sex: col('sex', 'gender', 'geschlecht'),
    ageMin: col('agemin', 'altervon', 'alterab', 'minalter'),
    ageMax: col('agemax', 'alterbis', 'maxalter'),
    sport: col('sport', 'sportart'),
    n: col('n', 'anzahl'),
    mean: col('mean', 'mittelwert', 'mw', 'average'),
    sd: col('sd', 'stdev', 'standardabweichung', 'std'),
  };
  const pctIdx = NORM_PERCENTILES.map((p) => col(`p${p}`, `perzentil${p}`));
  const missing = (['testType', 'metric'] as const).filter((k) => idx[k] < 0);
  if (missing.length)
    return {
      ...empty,
      fatal: 'missing_columns',
      missing: missing.map((m) => (m === 'testType' ? 'test_type' : 'metric')),
    };

  const seen = new Set<string>();
  const rows: NormImportRow[] = table.slice(1).map((raw, i) => {
    const line = i + 2;
    const cell = (c: number): string => (c >= 0 ? (raw[c] ?? '').trim() : '');
    const issues: NormIssue[] = [];
    const tt = testTypeFrom(cell(idx.testType), labels);
    if (!tt) issues.push({ code: 'test_type_unknown', field: 'test_type', value: cell(idx.testType) });
    const metric = metricFrom(cell(idx.metric));
    if (!metric) issues.push({ code: 'metric_unknown', field: 'metric', value: cell(idx.metric) });
    else if (tt) {
      const def = getMetric(metric)!;
      // Familie des Testtyps aus der Registry ableiten: Metrik muss für mindestens eine passende Familie existieren
      if (!def.families.length)
        issues.push({ code: 'metric_not_for_test', field: 'metric', value: cell(idx.metric) });
    }
    let sex: Sex | null = null;
    if (cell(idx.sex)) {
      sex = SEX[norm(cell(idx.sex))] ?? null;
      if (!sex) issues.push({ code: 'sex_invalid', field: 'sex', value: cell(idx.sex) });
    }
    const age = (c: number, f: string): number | null => {
      if (!cell(c)) return null;
      const v = cleanNum(cell(c));
      if (v === null || v < 0 || v > 120 || !Number.isInteger(v)) {
        issues.push({ code: 'age_invalid', field: f, value: cell(c) });
        return null;
      }
      return v;
    };
    const ageMin = age(idx.ageMin, 'age_min');
    const ageMax = age(idx.ageMax, 'age_max');
    if (ageMin !== null && ageMax !== null && ageMin > ageMax) issues.push({ code: 'age_range' });
    const num = (c: number, f: string): number | null => {
      if (!cell(c)) return null;
      const v = cleanNum(cell(c));
      if (v === null) issues.push({ code: 'number_invalid', field: f, value: cell(c) });
      return v;
    };
    const mean = num(idx.mean, 'mean');
    const sd = num(idx.sd, 'sd');
    const n = num(idx.n, 'n');
    const pct: NormRow['pct'] = {};
    NORM_PERCENTILES.forEach((p, k) => {
      const v = num(pctIdx[k]!, `p${p}`);
      if (v !== null) pct[p] = v;
    });
    if (sd !== null && !(sd > 0)) issues.push({ code: 'sd_invalid', field: 'sd', value: String(sd) });
    const havePct = Object.keys(pct).length >= 3;
    if ((mean === null || sd === null) && !havePct) issues.push({ code: 'value_missing' });
    const ordered = NORM_PERCENTILES.flatMap((p) => (pct[p] !== undefined ? [pct[p]!] : []));
    if (ordered.some((v, k) => k > 0 && v < ordered[k - 1]!)) issues.push({ code: 'percentiles_order' });
    const key = [tt, metric, sex, ageMin, ageMax, cell(idx.sport).toLowerCase()].join('|');
    if (!issues.length) {
      if (seen.has(key)) issues.push({ code: 'duplicate_stratum' });
      seen.add(key);
    }
    const row: NormRow | undefined =
      issues.length || !tt || !metric
        ? undefined
        : { testType: tt, metric, sex, ageMin, ageMax, sport: cell(idx.sport) || null, n, mean, sd, pct };
    return { line, row, issues };
  });
  const valid = rows.flatMap((r) => (r.row ? [r.row] : []));
  return { rows, valid, invalid: rows.length - valid.length, fatal: null, missing: [] };
}

/** Vorlage (nur Kopfzeile + ein ausdrücklich als Beispiel gekennzeichneter Datensatz mit frei erfundenen Zahlen). */
export function normTemplateCsv(): string {
  return `${NORM_CSV_HEADER.join(';')}\r\ncmj;jump_height_impmom;f;18;25;Beispielsport;100;30;4;;;;;;;\r\n`;
}
