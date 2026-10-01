import {
  DEFAULT_TILE_METRICS,
  TEST_TYPE_INFO,
  allMetrics,
  getMetric,
  type MetricDefinition,
  type TestType,
} from '@buildr/core';

/** Kennzahlen, die für einen Testtyp berechnet werden (Wertmetriken und Asymmetrien), Standard zuerst. */
export function metricOptionsFor(type: TestType): MetricDefinition[] {
  const family = TEST_TYPE_INFO[type].family;
  const all = allMetrics().filter((m) => m.families.includes(family));
  const defaults = DEFAULT_TILE_METRICS[type] ?? [];
  const rank = (k: string): number => {
    const i = defaults.indexOf(k);
    return i < 0 ? 1000 : i;
  };
  return all.sort((a, b) => rank(a.key) - rank(b.key) || a.label.de.localeCompare(b.label.de));
}

/** Standardkennzahl: erste Kachel des Testtyps, sonst erste verfügbare. */
export function defaultMetricFor(type: TestType): string | null {
  const opts = metricOptionsFor(type);
  const d = (DEFAULT_TILE_METRICS[type] ?? []).find((k) => opts.some((m) => m.key === k));
  return d ?? opts[0]?.key ?? null;
}

export const isAsymmetry = (key: string): boolean => getMetric(key)?.kind === 'asymmetry';
