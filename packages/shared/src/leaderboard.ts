import type { RepRecord } from './model.ts';

export type Aggregate = 'best' | 'last' | 'mean';

export interface LeaderboardOptions {
  testType: string;
  metric: string;
  aggregate: Aggregate;
  /** Richtung der Metrik: true = höher ist besser, false = niedriger ist besser, null = unbestimmt (→ höher) */
  higherIsBetter: boolean | null;
  /** Reihenfolge umkehren (z. B. wenn niedriger gewünscht ist) */
  invert?: boolean;
  /** Asymmetrien werden als Betrag gewertet, kleiner ist besser */
  asymmetry?: boolean;
}

export interface LeaderboardRow {
  profileId: string;
  /** gewerteter Wert (null = noch keine Messung) */
  value: number | null;
  /** Anzahl berücksichtigter Wiederholungen */
  n: number;
  /** Anzahl Tests des Typs */
  tests: number;
  best: number | null;
  last: number | null;
  mean: number | null;
  /** Wettkampfplatz (1,2,2,4 …); null ohne Wert */
  rank: number | null;
  /** Abstand zum Führenden in Einheiten der Metrik (≥ 0) */
  gap: number | null;
}

export interface LeaderboardTest {
  id: string;
  profileId: string | null;
  testType: string;
  createdAt: string;
  reps: ReadonlyArray<Pick<RepRecord, 'index' | 'included' | 'leadIn' | 'metrics'>>;
}

/**
 * Rangliste für einen Testtyp und eine Metrik. Berücksichtigt nur eingeschlossene Wiederholungen (ohne Lead-in), mehrere Tests
 * desselben Athleten werden chronologisch zusammengefasst (Bester/Letzter/Mittel). Gleiche Werte teilen sich den Platz.
 */
export function computeLeaderboard(
  tests: ReadonlyArray<LeaderboardTest>,
  profileIds: ReadonlyArray<string>,
  opts: LeaderboardOptions,
): LeaderboardRow[] {
  const higher = opts.asymmetry ? false : opts.higherIsBetter !== false;
  const better = opts.invert ? !higher : higher;
  const byProfile = new Map<string, { vals: number[]; tests: Set<string> }>();
  for (const id of profileIds) byProfile.set(id, { vals: [], tests: new Set() });

  const ordered = tests
    .filter((t) => t.profileId !== null && t.testType === opts.testType && byProfile.has(t.profileId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const t of ordered) {
    const slot = byProfile.get(t.profileId!)!;
    slot.tests.add(t.id);
    for (const r of [...t.reps].sort((a, b) => a.index - b.index)) {
      if (!r.included || r.leadIn) continue;
      const v = r.metrics[opts.metric];
      if (typeof v === 'number' && Number.isFinite(v)) slot.vals.push(opts.asymmetry ? Math.abs(v) : v);
    }
  }

  const rows: LeaderboardRow[] = profileIds.map((profileId) => {
    const { vals, tests: ts } = byProfile.get(profileId)!;
    const best = vals.length ? (better ? Math.max(...vals) : Math.min(...vals)) : null;
    const last = vals.length ? vals[vals.length - 1]! : null;
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const value = opts.aggregate === 'best' ? best : opts.aggregate === 'last' ? last : mean;
    return { profileId, value, n: vals.length, tests: ts.size, best, last, mean, rank: null, gap: null };
  });

  const scored = rows
    .filter((r) => r.value !== null)
    .sort(
      (a, b) =>
        (better ? b.value! - a.value! : a.value! - b.value!) || a.profileId.localeCompare(b.profileId),
    );
  const EPS = 1e-9;
  scored.forEach((r, i) => {
    const prev = scored[i - 1];
    r.rank = prev && Math.abs(prev.value! - r.value!) <= EPS ? prev.rank : i + 1;
    r.gap = Math.abs(scored[0]!.value! - r.value!);
  });
  // ohne Messung: hinten, Reihenfolge wie in der Warteschlange
  return [...scored, ...rows.filter((r) => r.value === null)];
}
