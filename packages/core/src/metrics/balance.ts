import { asymmetryPct } from '../numerics.ts';
import { convexHullArea, ellipseArea95, pathLength } from '../balance.ts';
import { sd } from '../stats.ts';
import { defineMetric } from './registry.ts';
import { must } from './helpers.ts';
import type { RepContext } from './types.ts';

const BAL = ['balance'] as const;
const bal = (c: RepContext) => must(c.balance, 'keine Balance-Daten');
const dur = (c: RepContext): number => bal(c).x.length / c.hz;
const need2d = (c: RepContext): { x: Float64Array; y: Float64Array } => {
  const b = bal(c);
  if (!b.y) throw new Error('AP-Richtung unbekannt (keine Eckensensoren)');
  return { x: b.x, y: b.y };
};

defineMetric({
  key: 'balance_duration',
  label: { de: 'Auswertedauer', en: 'Analysis Duration' },
  unit: 's',
  phase: 'balance',
  description: {
    de: 'Dauer des ausgewerteten Fensters (ohne die ersten 1 s Einschwingen).',
    en: 'Duration of the analysed window (excluding the first 1 s settling).',
  },
  formula: 'N / f_s',
  families: [...BAL],
  compute: (c) => dur(c),
});

defineMetric({
  key: 'cop_path_length',
  label: { de: 'CoP-Pfadlänge', en: 'CoP Path Length' },
  unit: 'mm',
  phase: 'balance',
  higherIsBetter: false,
  description: {
    de: 'Gesamtlänge der CoP-Bahn (10-Hz-Zero-Phase-Tiefpass).',
    en: 'Total length of the CoP trajectory (10 Hz zero-phase low-pass).',
  },
  formula: 'L = Σ √(Δx² + Δy²)',
  families: [...BAL],
  compute: (c) => {
    const d = need2d(c);
    return pathLength(d.x, d.y);
  },
});

defineMetric({
  key: 'cop_mean_velocity',
  label: { de: 'CoP-Mittelgeschwindigkeit', en: 'CoP Mean Velocity' },
  unit: 'mm/s',
  phase: 'balance',
  higherIsBetter: false,
  description: {
    de: 'Mittlere Geschwindigkeit des CoP (Pfadlänge / Dauer).',
    en: 'Mean CoP velocity (path length / duration).',
  },
  formula: 'v̄ = L / T',
  families: [...BAL],
  compute: (c) => {
    const d = need2d(c);
    return pathLength(d.x, d.y) / dur(c);
  },
});

defineMetric({
  key: 'cop_area_95',
  label: { de: 'CoP-Fläche (95-%-Ellipse)', en: 'CoP Area (95 % ellipse)' },
  unit: 'mm²',
  phase: 'balance',
  higherIsBetter: false,
  description: {
    de: 'Fläche der 95-%-Konfidenzellipse der CoP-Punktwolke.',
    en: 'Area of the 95 % confidence ellipse of the CoP cloud.',
  },
  formula: 'A = χ²(2; 0,95)·π·√(λ₁·λ₂) = 5,991·π·√det Σ',
  families: [...BAL],
  compute: (c) => {
    const d = need2d(c);
    return ellipseArea95(d.x, d.y);
  },
});

defineMetric({
  key: 'cop_hull_area',
  label: { de: 'CoP-Hüllfläche', en: 'CoP Hull Area' },
  unit: 'mm²',
  phase: 'balance',
  description: {
    de: 'Fläche der konvexen Hülle der CoP-Bahn (Stabilitätsbereich).',
    en: 'Area of the convex hull of the CoP trajectory (range of stability).',
  },
  formula: 'Fläche der konvexen Hülle aller CoP-Punkte',
  families: [...BAL],
  compute: (c) => {
    const d = need2d(c);
    return convexHullArea(d.x, d.y);
  },
});

defineMetric({
  key: 'cop_ap_sd',
  label: { de: 'AP-Schwankung (SD)', en: 'AP Sway (SD)' },
  unit: 'mm',
  phase: 'balance',
  higherIsBetter: false,
  description: {
    de: 'Standardabweichung der CoP-Position in anterior-posteriorer Richtung.',
    en: 'Standard deviation of CoP position in the anterior-posterior direction.',
  },
  formula: 'SD(y)',
  families: [...BAL],
  compute: (c) => sd(need2d(c).y),
});

defineMetric({
  key: 'cop_ml_sd',
  label: { de: 'ML-Schwankung (SD)', en: 'ML Sway (SD)' },
  unit: 'mm',
  phase: 'balance',
  higherIsBetter: false,
  description: {
    de: 'Standardabweichung der CoP-Position in medio-lateraler Richtung.',
    en: 'Standard deviation of CoP position in the medio-lateral direction.',
  },
  formula: 'SD(x)',
  families: [...BAL],
  compute: (c) => sd(bal(c).x),
});

const range = (a: Float64Array): number => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo;
};

defineMetric({
  key: 'cop_ap_range',
  label: { de: 'AP-Ausschlag (Range)', en: 'AP Range' },
  unit: 'mm',
  phase: 'balance',
  description: {
    de: 'Maximaler Ausschlag des CoP in AP-Richtung.',
    en: 'Maximum CoP excursion in the AP direction.',
  },
  formula: 'max y − min y',
  families: [...BAL],
  compute: (c) => range(need2d(c).y),
});

defineMetric({
  key: 'cop_ml_range',
  label: { de: 'ML-Ausschlag (Range)', en: 'ML Range' },
  unit: 'mm',
  phase: 'balance',
  description: {
    de: 'Maximaler Ausschlag des CoP in ML-Richtung.',
    en: 'Maximum CoP excursion in the ML direction.',
  },
  formula: 'max x − min x',
  families: [...BAL],
  compute: (c) => range(bal(c).x),
});

const meanAbsVel = (a: Float64Array, hz: number): number => {
  let s = 0;
  for (let i = 1; i < a.length; i++) s += Math.abs(a[i]! - a[i - 1]!);
  return (s * hz) / (a.length - 1);
};

defineMetric({
  key: 'cop_ap_velocity',
  label: { de: 'AP-Geschwindigkeit', en: 'AP Velocity' },
  unit: 'mm/s',
  phase: 'balance',
  higherIsBetter: false,
  description: {
    de: 'Mittlere Betragsgeschwindigkeit des CoP in AP-Richtung.',
    en: 'Mean absolute CoP velocity in the AP direction.',
  },
  formula: 'mean |Δy|·f_s',
  families: [...BAL],
  compute: (c) => meanAbsVel(need2d(c).y, c.hz),
});

defineMetric({
  key: 'cop_ml_velocity',
  label: { de: 'ML-Geschwindigkeit', en: 'ML Velocity' },
  unit: 'mm/s',
  phase: 'balance',
  higherIsBetter: false,
  description: {
    de: 'Mittlere Betragsgeschwindigkeit des CoP in ML-Richtung.',
    en: 'Mean absolute CoP velocity in the ML direction.',
  },
  formula: 'mean |Δx|·f_s',
  families: [...BAL],
  compute: (c) => meanAbsVel(bal(c).x, c.hz),
});

defineMetric({
  key: 'asym_balance_load',
  label: { de: 'Asymmetrie Belastung', en: 'Weight-bearing Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie der mittleren Plattenlast im Auswertefenster.',
    en: 'Left/right asymmetry of mean plate load in the analysis window.',
  },
  formula: 'Mittelkraft je Platte; Asymmetrie = (größere − kleinere)/größere · 100; + = rechts höher.',
  families: [...BAL],
  compute: (c) => {
    const b = bal(c);
    let l = 0;
    let r = 0;
    for (let i = b.start; i < b.end; i++) {
      l += c.left[i]!;
      r += c.right[i]!;
    }
    return asymmetryPct(l / (b.end - b.start), r / (b.end - b.start));
  },
});
