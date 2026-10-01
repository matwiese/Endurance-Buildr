import { asymmetryPct, trapzRange } from '../numerics.ts';
import { interpAt } from '../stats.ts';
import { defineMetric } from './registry.ts';
import { must } from './helpers.ts';
import type { RepContext } from './types.ts';

const ISO = ['isometric'] as const;
const iso = (c: RepContext) => must(c.iso, 'keine Isometrie-Daten');

/** Roh-Spitzenwert (Gesamtkraft) der Kontraktion; bei invertierter Richtung das Minimum. */
function rawPeak(c: RepContext): number {
  const i = iso(c);
  let best = i.sign * c.total[i.onset]!;
  for (let k = i.onset; k < i.end; k++) best = Math.max(best, i.sign * c.total[k]!);
  return i.sign * best;
}

defineMetric({
  key: 'iso_peak_force',
  label: { de: 'Spitzenkraft', en: 'Peak Force' },
  unit: 'N',
  phase: 'isometric',
  higherIsBetter: true,
  description: {
    de: 'Maximale Gesamtkraft der Kontraktion (brutto).',
    en: 'Maximum total force of the contraction (gross).',
  },
  formula: 'F_peak = max F(t) über die Kontraktion (bei invertierter Richtung: min F(t))',
  families: [...ISO],
  compute: (c) => rawPeak(c),
});

defineMetric({
  key: 'iso_net_peak_force',
  label: { de: 'Netto-Spitzenkraft', en: 'Net Peak Force' },
  unit: 'N',
  phase: 'isometric',
  higherIsBetter: true,
  description: {
    de: 'Spitzenkraft abzüglich Körpergewicht in Testposition (bzw. Basislinie).',
    en: 'Peak force minus body weight in test position (or baseline).',
  },
  formula: 'F_net = |F_peak − BW|,  BW = Gewicht in Testposition (gewogen) bzw. Ruhe-Basislinie',
  families: [...ISO],
  compute: (c) => iso(c).sign * (rawPeak(c) - (c.bodyMass > 0 ? c.bodyMass * 9.80665 : iso(c).baselineN)),
});

defineMetric({
  key: 'iso_time_to_peak',
  label: { de: 'Zeit bis Spitzenkraft', en: 'Time to Peak Force' },
  unit: 's',
  phase: 'isometric',
  higherIsBetter: false,
  description: {
    de: 'Zeit vom Kontraktionsbeginn (Yank-/5-SD-Onset) bis zur Spitzenkraft.',
    en: 'Time from contraction onset (yank/5-SD) to peak force.',
  },
  formula: 't(F_peak) − t_Onset',
  families: [...ISO],
  compute: (c) => (iso(c).peakIdx - iso(c).onset) / c.hz,
});

defineMetric({
  key: 'iso_duration',
  label: { de: 'Kontraktionsdauer', en: 'Contraction Duration' },
  unit: 's',
  phase: 'isometric',
  description: {
    de: 'Dauer der Kontraktion (Onset bis Kraftabfall unter 15 % der Spitze).',
    en: 'Duration of the contraction (onset until force falls below 15 % of peak).',
  },
  formula: 't_Ende − t_Onset',
  families: [...ISO],
  compute: (c) => (iso(c).end - iso(c).onset) / c.hz,
});

for (const w of [50, 100, 150, 200, 250]) {
  defineMetric({
    key: `iso_rfd_${w}`,
    label: { de: `RFD 0–${w} ms`, en: `RFD 0–${w} ms` },
    unit: 'N/s',
    phase: 'isometric',
    higherIsBetter: true,
    description: {
      de: `Mittlere Kraftanstiegsrate in den ersten ${w} ms ab Onset.`,
      en: `Average rate of force development in the first ${w} ms from onset.`,
    },
    formula: `RFD = (F(t_Onset + ${w} ms) − F_Basis) / ${w} ms`,
    families: [...ISO],
    compute: (c) => {
      const i = iso(c);
      const t = i.onset + (w / 1000) * c.hz;
      if (t > c.total.length - 1) return null;
      return (i.sign * (interpAt(c.total, t) - i.baselineN)) / (w / 1000);
    },
  });
}

for (const w of [100, 200, 300]) {
  defineMetric({
    key: `iso_impulse_${w}ms`,
    label: { de: `Impuls 0–${w} ms`, en: `Impulse 0–${w} ms` },
    unit: 'N·s',
    phase: 'isometric',
    higherIsBetter: true,
    description: {
      de: `Netto-Impuls über der Basislinie in den ersten ${w} ms ab Onset.`,
      en: `Net impulse above baseline in the first ${w} ms from onset.`,
    },
    formula: `J = ∫(F − F_Basis) dt über [t_Onset, t_Onset + ${w} ms]`,
    families: [...ISO],
    compute: (c) => {
      const i = iso(c);
      const t = i.onset + (w / 1000) * c.hz;
      if (t > c.total.length - 1) return null;
      return (i.sign * trapzRange(c.total, i.onset, t, i.baselineN)) / c.hz;
    },
  });
}

defineMetric({
  key: 'iso_rfd_max',
  label: { de: 'Max-RFD (20 ms)', en: 'Max RFD (20 ms)' },
  unit: 'N/s',
  phase: 'isometric',
  higherIsBetter: true,
  description: {
    de: 'Größter Kraftanstieg in einem 20-ms-Fenster zwischen Onset und Spitzenkraft.',
    en: 'Largest force rise in a 20 ms window between onset and peak.',
  },
  formula: 'max_t [F(t + 20 ms) − F(t)] / 0,02 s',
  families: [...ISO],
  compute: (c) => {
    const i = iso(c);
    const w = Math.max(1, Math.round(0.02 * c.hz));
    let best = -Infinity;
    for (let k = i.onset; k + w <= i.peakIdx; k++)
      best = Math.max(best, (i.sign * (c.total[k + w]! - c.total[k]!)) / (w / c.hz));
    return Number.isFinite(best) ? best : null;
  },
});

defineMetric({
  key: 'asym_iso_peak_force',
  label: { de: 'Asymmetrie Spitzenkraft', en: 'Peak Force Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie der Netto-Spitzenkraft je Platte (über der jeweiligen Basislinie).',
    en: 'Left/right asymmetry of net peak force per plate (above each baseline).',
  },
  formula:
    'Netto-Spitze je Platte = |extremum − Basislinie_Platte|. Asymmetrie = (größere − kleinere Seite)/größere · 100; + = rechts höher.',
  families: [...ISO],
  compute: (c) => {
    const i = iso(c);
    const ext = (a: Float64Array): number => {
      let e = i.sign * a[i.onset]!;
      for (let k = i.onset; k < i.end; k++) e = Math.max(e, i.sign * a[k]!);
      return i.sign * e;
    };
    return asymmetryPct(Math.abs(ext(c.left) - i.baseLeft), Math.abs(ext(c.right) - i.baseRight));
  },
});

defineMetric({
  key: 'asym_iso_impulse_200ms',
  label: { de: 'Asymmetrie Impuls 0–200 ms', en: 'Impulse 0–200 ms Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie des Netto-Impulses in den ersten 200 ms.',
    en: 'Left/right asymmetry of net impulse in the first 200 ms.',
  },
  formula:
    'J_Platte = ∫(F_Platte − Basislinie_Platte) dt über [t_Onset, t_Onset + 200 ms]; Vorzeichen: + = rechts höher.',
  families: [...ISO],
  compute: (c) => {
    const i = iso(c);
    const t = i.onset + 0.2 * c.hz;
    if (t > c.total.length - 1) return null;
    const jl = (i.sign * trapzRange(c.left, i.onset, t, i.baseLeft)) / c.hz;
    const jr = (i.sign * trapzRange(c.right, i.onset, t, i.baseRight)) / c.hz;
    return asymmetryPct(jl, jr);
  },
});
