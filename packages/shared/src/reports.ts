import { getMetric } from '@buildr/core';
import type { Aggregate } from './leaderboard.ts';
import type { GroupDTO, ProfileDTO, RepRecord } from './model.ts';
import { evaluateNorm, matchNorm, type NormBand, type NormRow } from './norms.ts';
import { ageOn } from './validation.ts';

export interface ReportTest {
  id: string;
  profileId: string | null;
  testType: string;
  createdAt: string;
  reps: ReadonlyArray<Pick<RepRecord, 'index' | 'included' | 'leadIn' | 'metrics'>>;
}

export type ReportMode = 'value' | 'zTeam' | 'pctChange' | 'zNorm';

export interface ReportOptions {
  testType: string;
  /** höchstens 20 Kennzahlen */
  metrics: string[];
  /** Zeitraum (ISO, einschließlich) */
  from?: string;
  to?: string;
  /** nur Athleten dieser Gruppen (leer = alle) */
  groupIds?: string[];
  /** nur diese Athleten (leer = alle) */
  profileIds?: string[];
  aggregate: Aggregate;
  mode: ReportMode;
  /** Vergleichszeitraum für „% Änderung“ (Mittel über dessen Wiederholungen) */
  baseline?: { from?: string; to?: string };
  norms?: ReadonlyArray<NormRow>;
  /** Referenzdatum für das Alter (Standard: Zeitpunkt des letzten Tests im Zeitraum) */
  today?: Date;
}

export const MAX_REPORT_METRICS = 20;

export interface ReportCell {
  /** aggregierter Rohwert im Zeitraum (Einheit der Metrik) */
  value: number | null;
  /** Wert gemäß Modus (Rohwert, z-Score, % Änderung) */
  shown: number | null;
  n: number;
  /** nur im Modus zNorm */
  percentile?: number | null;
  band?: NormBand | null;
}

export interface ReportRow {
  profileId: string;
  name: string;
  groupIds: string[];
  tests: number;
  cells: Record<string, ReportCell>;
}

export interface Stats {
  n: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
}

export interface GroupStats {
  groupId: string;
  name: string;
  n: number;
  perMetric: Record<string, Stats>;
}

export interface Report {
  options: ReportOptions;
  rows: ReportRow[];
  /** Kennzahlen über die Athleten (Rohwerte) */
  stats: Record<string, Stats>;
  groups: GroupStats[];
}

export function statsOf(values: ReadonlyArray<number>): Stats {
  const n = values.length;
  if (!n) return { n: 0, mean: null, sd: null, min: null, max: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return { n, mean, sd, min: Math.min(...values), max: Math.max(...values) };
}

/** Werte (chronologisch) der eingeschlossenen Wiederholungen eines Athleten für eine Kennzahl. */
function collect(tests: ReadonlyArray<ReportTest>, metric: string): number[] {
  const out: number[] = [];
  for (const t of [...tests].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )) {
    for (const r of [...t.reps].sort((a, b) => a.index - b.index)) {
      if (!r.included || r.leadIn) continue;
      const v = r.metrics[metric];
      if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/** Aggregiert Werte; Richtung der Metrik bestimmt „Bester“ (unbestimmt → höher). Asymmetrien: kleinster Betrag. */
export function aggregateValues(
  values: ReadonlyArray<number>,
  metric: string,
  aggregate: Aggregate,
): number | null {
  if (!values.length) return null;
  const def = getMetric(metric);
  if (aggregate === 'last') return values[values.length - 1]!;
  if (aggregate === 'mean') return values.reduce((a, b) => a + b, 0) / values.length;
  if (def?.kind === 'asymmetry') return values.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
  return def?.higherIsBetter === false ? Math.min(...values) : Math.max(...values);
}

const inRange = (iso: string, from?: string, to?: string): boolean =>
  (!from || iso >= from) && (!to || iso <= to);

/** Bericht über Athleten × Kennzahlen mit Team-Statistik, Gruppenvergleich und Modi Wert / z-Score (Team|Norm) / % Änderung. */
export function buildReport(
  tests: ReadonlyArray<ReportTest>,
  profiles: ReadonlyArray<ProfileDTO>,
  groups: ReadonlyArray<GroupDTO>,
  opts: ReportOptions,
): Report {
  const metrics = opts.metrics.slice(0, MAX_REPORT_METRICS);
  const wantGroups = new Set(opts.groupIds ?? []);
  const wantProfiles = new Set(opts.profileIds ?? []);
  const people = profiles.filter(
    (p) =>
      (!wantProfiles.size || wantProfiles.has(p.id)) &&
      (!wantGroups.size || p.groupIds.some((g) => wantGroups.has(g))),
  );
  const byProfile = new Map<string, ReportTest[]>();
  for (const t of tests) {
    if (t.profileId === null || t.testType !== opts.testType) continue;
    (byProfile.get(t.profileId) ?? byProfile.set(t.profileId, []).get(t.profileId)!).push(t);
  }

  const rows: ReportRow[] = [];
  for (const p of people) {
    const all = byProfile.get(p.id) ?? [];
    const period = all.filter((t) => inRange(t.createdAt, opts.from, opts.to));
    if (!period.length) continue;
    const cells: Record<string, ReportCell> = {};
    for (const m of metrics) {
      const vals = collect(period, m);
      cells[m] = { value: aggregateValues(vals, m, opts.aggregate), shown: null, n: vals.length };
    }
    rows.push({ profileId: p.id, name: p.name, groupIds: p.groupIds, tests: period.length, cells });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const stats: Record<string, Stats> = {};
  for (const m of metrics)
    stats[m] = statsOf(rows.flatMap((r) => (r.cells[m]!.value === null ? [] : [r.cells[m]!.value!])));

  // Modus anwenden
  for (const r of rows) {
    const p = people.find((x) => x.id === r.profileId)!;
    for (const m of metrics) {
      const c = r.cells[m]!;
      if (c.value === null) continue;
      if (opts.mode === 'value') c.shown = c.value;
      else if (opts.mode === 'zTeam') {
        const s = stats[m]!;
        c.shown = s.sd && s.sd > 0 && s.mean !== null ? (c.value - s.mean) / s.sd : null;
      } else if (opts.mode === 'pctChange') {
        const base = opts.baseline;
        const baseTests = (byProfile.get(p.id) ?? []).filter((t) =>
          inRange(t.createdAt, base?.from, base?.to),
        );
        const b = aggregateValues(collect(baseTests, m), m, 'mean');
        c.shown = b !== null && b !== 0 ? ((c.value - b) / Math.abs(b)) * 100 : null;
      } else if (opts.mode === 'zNorm') {
        const lastDate = [...(byProfile.get(p.id) ?? [])]
          .filter((t) => inRange(t.createdAt, opts.from, opts.to))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt;
        const age = lastDate
          ? ageOn(p.dateOfBirth, new Date(lastDate))
          : opts.today
            ? ageOn(p.dateOfBirth, opts.today)
            : null;
        const row = opts.norms
          ? matchNorm(opts.norms, { sex: p.sex, ageYears: age, sport: p.sport }, opts.testType, m)
          : null;
        const ev = row ? evaluateNorm(c.value, row) : null;
        c.shown = ev?.z ?? null;
        c.percentile = ev?.percentile ?? null;
        c.band = ev?.band ?? null;
      }
    }
  }

  // Gruppenvergleich (Athleten mehrerer Gruppen zählen in jeder)
  const gSel = wantGroups.size ? groups.filter((g) => wantGroups.has(g.id)) : groups;
  const groupStats: GroupStats[] = gSel
    .map((g) => {
      const members = rows.filter((r) => r.groupIds.includes(g.id));
      const perMetric: Record<string, Stats> = {};
      for (const m of metrics)
        perMetric[m] = statsOf(
          members.flatMap((r) => (r.cells[m]!.value === null ? [] : [r.cells[m]!.value!])),
        );
      return { groupId: g.id, name: g.name, n: members.length, perMetric };
    })
    .filter((g) => g.n > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { options: { ...opts, metrics }, rows, stats, groups: groupStats };
}

export interface ProgressPoint {
  testId: string;
  at: string;
  value: number;
  n: number;
  /** Einordnung gegen die Norm zum Testzeitpunkt (Alter zum Datum) */
  z: number | null;
  percentile: number | null;
}

export interface Progress {
  points: ProgressPoint[];
  /** Mittel der ersten `baselineN` Tests (oder Zeitfenster) */
  baseline: number | null;
  baselineCount: number;
  /** % Änderung des letzten Punktes gegenüber der Baseline */
  changePct: number | null;
  /** aktuelle Norm (zum letzten Test) */
  norm: NormRow | null;
}

/** Verlauf einer Kennzahl über die Tests eines Athleten (je Test aggregiert) mit Baseline und Norm-Einordnung. */
export function buildProgress(
  tests: ReadonlyArray<ReportTest>,
  profile: Pick<ProfileDTO, 'id' | 'sex' | 'dateOfBirth' | 'sport'>,
  o: {
    testType: string;
    metric: string;
    aggregate: Aggregate;
    baselineN?: number;
    baseline?: { from?: string; to?: string };
    norms?: ReadonlyArray<NormRow>;
  },
): Progress {
  const mine = tests
    .filter((t) => t.profileId === profile.id && t.testType === o.testType)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const points: ProgressPoint[] = [];
  let norm: NormRow | null = null;
  for (const t of mine) {
    const vals = collect([t], o.metric);
    const v = aggregateValues(vals, o.metric, o.aggregate);
    if (v === null) continue;
    const age = ageOn(profile.dateOfBirth, new Date(t.createdAt));
    const row = o.norms
      ? matchNorm(o.norms, { sex: profile.sex, ageYears: age, sport: profile.sport }, o.testType, o.metric)
      : null;
    const ev = row ? evaluateNorm(v, row) : null;
    if (row) norm = row;
    points.push({
      testId: t.id,
      at: t.createdAt,
      value: v,
      n: vals.length,
      z: ev?.z ?? null,
      percentile: ev?.percentile ?? null,
    });
  }
  const basePts = o.baseline
    ? points.filter((p) => inRange(p.at, o.baseline!.from, o.baseline!.to))
    : points.slice(0, o.baselineN ?? 3);
  const baseline = basePts.length ? basePts.reduce((a, p) => a + p.value, 0) / basePts.length : null;
  const last = points[points.length - 1];
  const changePct =
    baseline !== null && baseline !== 0 && last ? ((last.value - baseline) / Math.abs(baseline)) * 100 : null;
  return { points, baseline, baselineCount: basePts.length, changePct, norm };
}

/** Bericht als CSV-Zeilen (Kopf + je Athlet + Team-Statistik). Beschriftungen kommen vom Aufrufer (Sprache/Einheiten). */
export function reportToRows(
  report: Report,
  label: (metric: string) => string,
  texts: { athlete: string; tests: string; mean: string; sd: string; min: string; max: string },
): Array<Array<string | number | null>> {
  const ms = report.options.metrics;
  const out: Array<Array<string | number | null>> = [[texts.athlete, texts.tests, ...ms.map(label)]];
  for (const r of report.rows) out.push([r.name, r.tests, ...ms.map((m) => r.cells[m]!.shown)]);
  const stat = (name: string, pick: (s: Stats) => number | null) =>
    out.push([name, null, ...ms.map((m) => pick(report.stats[m]!))]);
  stat(texts.mean, (s) => s.mean);
  stat(texts.sd, (s) => s.sd);
  stat(texts.min, (s) => s.min);
  stat(texts.max, (s) => s.max);
  return out;
}
