import { TEST_TYPE_INFO, allMetrics, toCsv, type MetricDefinition } from '@buildr/core';
import type { ProfileDTO, TestRecord } from '@buildr/shared';

/**
 * Ergebnisse einer Session als CSV (eine Zeile je eingeschlossener Wiederholung, Kennzahlen in metrischen Einheiten).
 * Spalten: Athlet, Testtyp, Zeit, Wiederholung, danach alle vorkommenden Kennzahlen (Registry-Reihenfolge).
 */
export function sessionResultsCsv(
  tests: ReadonlyArray<TestRecord>,
  profiles: ReadonlyMap<string, ProfileDTO>,
  lang: 'de' | 'en',
): string {
  const used = new Set<string>();
  for (const t of tests)
    for (const r of t.reps) for (const k of Object.keys(r.metrics)) if (r.metrics[k] !== null) used.add(k);
  const defs: MetricDefinition[] = allMetrics().filter((m) => used.has(m.key));
  const header = [
    lang === 'de' ? 'Athlet' : 'Athlete',
    lang === 'de' ? 'Testtyp' : 'Test type',
    lang === 'de' ? 'Zeit' : 'Time',
    lang === 'de' ? 'Wdh.' : 'Rep',
    ...defs.map((m) => `${m.label[lang]}${m.unit ? ` [${m.unit}]` : ''}`),
  ];
  const rows: Array<Array<string | number | null>> = [header];
  const ordered = [...tests].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const t of ordered) {
    const name = t.profileId ? (profiles.get(t.profileId)?.name ?? '?') : lang === 'de' ? 'Gast' : 'Guest';
    for (const r of t.reps) {
      if (!r.included || r.leadIn) continue;
      rows.push([
        name,
        TEST_TYPE_INFO[t.testType].label[lang],
        t.createdAt,
        r.hopIndex ?? r.index + 1,
        ...defs.map((m) => r.metrics[m.key] ?? null),
      ]);
    }
  }
  return toCsv(rows, { delimiter: ';', bom: true });
}
