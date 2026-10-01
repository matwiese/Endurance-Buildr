import type { TestFamily } from '../testTypes.ts';
import type { MetricDefinition, MetricInput, Quantity, RepContext } from './types.ts';

const REGISTRY = new Map<string, MetricDefinition>();

const QUANTITY_BY_UNIT: Record<string, Quantity> = {
  cm: 'length',
  mm: 'length',
  s: 'time',
  ms: 'time',
  'm/s': 'velocity',
  'mm/s': 'speed',
  N: 'force',
  'N·s': 'impulse',
  W: 'power',
  'W/kg': 'powerRel',
  'N/s': 'rfd',
  kg: 'mass',
  '%': 'percent',
  '': 'ratio',
  'N/m': 'stiffness',
  'mm²': 'area',
  'm/s²': 'ratio',
};

const DECIMALS_BY_UNIT: Record<string, number> = {
  cm: 1,
  mm: 1,
  s: 3,
  'm/s': 2,
  'mm/s': 1,
  N: 0,
  'N·s': 1,
  W: 0,
  'W/kg': 1,
  'N/s': 0,
  kg: 1,
  '%': 1,
  '': 2,
  'N/m': 0,
  'mm²': 0,
};

/** Registriert eine Metrik (Schlüssel müssen eindeutig sein). */
export function defineMetric(input: MetricInput): MetricDefinition {
  if (REGISTRY.has(input.key)) throw new Error(`Metrik doppelt registriert: ${input.key}`);
  const def: MetricDefinition = {
    kind: 'value',
    higherIsBetter: null,
    decimals: DECIMALS_BY_UNIT[input.unit] ?? 2,
    quantity: QUANTITY_BY_UNIT[input.unit] ?? 'ratio',
    ...input,
  };
  REGISTRY.set(def.key, def);
  return def;
}

export const getMetric = (key: string): MetricDefinition | undefined => REGISTRY.get(key);
export const allMetrics = (): MetricDefinition[] => [...REGISTRY.values()];
export const metricsForFamily = (family: TestFamily): MetricDefinition[] =>
  allMetrics().filter((m) => m.families.includes(family));

/** Berechnet alle Metriken der Familie; Ausnahmen einzelner Metriken werden zu `null` (Rep bleibt nutzbar). */
export function computeMetrics(ctx: RepContext): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const m of metricsForFamily(ctx.family)) {
    if (m.kind === 'asymmetry' && ctx.singleLeg) {
      out[m.key] = null;
      continue;
    }
    try {
      const v = m.compute(ctx);
      out[m.key] = v !== null && Number.isFinite(v) ? v : null;
    } catch {
      out[m.key] = null;
    }
  }
  return out;
}
