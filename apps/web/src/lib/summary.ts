import { getMetric } from '@buildr/core';
import type { RepRecord } from '@buildr/shared';

export interface MetricSummary {
  key: string;
  n: number;
  mean: number | null;
  sd: number | null;
  best: number | null;
}

type RepLike = Pick<RepRecord, 'included' | 'metrics'> & { removed?: boolean; leadIn?: boolean };

/** Mittel/SD/Beste über die eingeschlossenen Wiederholungen. Asymmetrien werden über Beträge gemittelt (Seite wechselt sonst). */
export function summarize(reps: ReadonlyArray<RepLike>, keys: string[]): MetricSummary[] {
  const used = reps.filter((r) => r.included && !r.removed && !r.leadIn);
  return keys.map((key) => {
    const def = getMetric(key);
    const vals = used
      .map((r) => r.metrics[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (!vals.length) return { key, n: 0, mean: null, sd: null, best: null };
    const asym = def?.kind === 'asymmetry';
    const xs = asym ? vals.map(Math.abs) : vals;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd =
      xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : null;
    const best =
      asym || def?.higherIsBetter === null || def?.higherIsBetter === undefined
        ? null
        : def.higherIsBetter
          ? Math.max(...xs)
          : Math.min(...xs);
    return { key, n: xs.length, mean, sd, best };
  });
}
