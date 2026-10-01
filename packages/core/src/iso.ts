import type { AnalysisConfig } from './config/index.ts';
import { isoPresetFor } from './config/iso-presets.ts';
import { G } from './constants.ts';
import { mean, msToSamples, sd } from './stats.ts';
import type { TestType } from './testTypes.ts';

export interface Contraction {
  /** Onset (Integer-Sample) */
  onset: number;
  peakIdx: number;
  /** Ende des Kraftplateaus/der Kontraktion (exklusiv) */
  end: number;
  baseline: number;
  baseLeft: number;
  baseRight: number;
  baseSd: number;
  sign: 1 | -1;
  /** Auslöser der Onset-Erkennung (Index der anhaltenden Schwellenüberschreitung) */
  crossingIdx: number;
  method: 'yank' | 'sd5';
}

function movingAverage(x: Float64Array, w: number): Float64Array {
  if (w <= 1) return x;
  const n = x.length;
  const out = new Float64Array(n);
  const c = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) c[i + 1] = c[i]! + x[i]!;
  const h = w >> 1;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h);
    const b = Math.min(n, i + h + 1);
    out[i] = (c[b]! - c[a]!) / (b - a);
  }
  return out;
}

/**
 * Findet Kontraktionen in einer Isometrie-Aufnahme.
 *  - Basislinie: `baselineN` (Gewicht in Testposition, falls gewogen), sonst Median der ersten 500 ms.
 *  - Vorzeichen: Richtung der größten Auslenkung (+1 Kraft steigt, −1 Kraft sinkt ⇒ invertiert ausgewertet).
 *  - Onset: Yank (≥ 40 N/s bei Netto-Peak < 250 N, ≥ 350 N/s sonst; 50-ms-Differenz, ≥ 30 ms anhaltend) mit Rückverfolgung
 *    bis zum Rauschniveau – oder 5-SD-Verfahren (cfg.isoOnset.method).
 */
export function detectContractions(
  total: Float64Array,
  left: Float64Array,
  right: Float64Array,
  hz: number,
  cfg: AnalysisConfig,
  type: TestType,
  baselineN?: number,
  from = 0,
  to = total.length,
): Contraction[] {
  const preset = isoPresetFor(type);
  const c = cfg.isoOnset;
  const minN = preset.minContractionN ?? c.minContractionN;
  const n = to - from;
  if (n < msToSamples(500, hz)) return [];
  let base0 = baselineN;
  if (base0 === undefined) {
    const seg = Array.from({ length: msToSamples(500, hz) }, (_, i) => total[from + i]!).sort(
      (a, b) => a - b,
    );
    base0 = seg[seg.length >> 1]!;
  }
  // Vorzeichen: größte Auslenkung relativ zur Basislinie
  let maxPos = 0;
  let maxNeg = 0;
  for (let i = from; i < to; i++) {
    const d = total[i]! - base0;
    if (d > maxPos) maxPos = d;
    if (d < maxNeg) maxNeg = d;
  }
  const sign: 1 | -1 = maxPos >= -maxNeg ? 1 : -1;
  const peakGlobal = Math.max(maxPos, -maxNeg);
  if (peakGlobal < minN) return [];

  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = sign * (total[from + i]! - base0);
  const xs = movingAverage(x, Math.max(1, msToSamples(10, hz)));
  const xs50 = movingAverage(x, Math.max(1, msToSamples(50, hz)));
  const thr = Math.max(minN * 0.5, 0.15 * peakGlobal);
  const gap = msToSamples(300, hz);
  const minLen = msToSamples(200, hz);
  const runs: Array<[number, number]> = [];
  let i = 0;
  while (i < n) {
    if (xs[i]! > thr) {
      const s = i;
      while (i < n && xs[i]! > thr) i++;
      const last = runs[runs.length - 1];
      if (last && s - last[1] < gap) last[1] = i;
      else runs.push([s, i]);
    } else i++;
  }
  const out: Contraction[] = [];
  let prevEnd = 0;
  for (const [rs, re] of runs) {
    if (re - rs < minLen) continue;
    // Spitzenindex auf der 50-ms-geglätteten Kurve (das Plateau ist flach, der Roh-Maximalwert liegt rauschbedingt irgendwo darin);
    // der Spitzen-WERT (Metrik) bleibt der Roh-Maximalwert des Laufs.
    let pk = rs;
    for (let k = rs; k < re; k++) if (xs50[k]! > xs50[pk]!) pk = k;
    if (xs50[pk]! < minN) continue;
    // lokale Basislinie unmittelbar vor dem Lauf
    const bEnd = Math.max(prevEnd, rs - msToSamples(150, hz));
    const bStart = Math.max(prevEnd, bEnd - msToSamples(1000, hz));
    const useLocal = bEnd - bStart >= msToSamples(200, hz);
    const baseAbs = useLocal ? mean(total, from + bStart, from + bEnd) : base0;
    const baseSd = useLocal ? sd(total, from + bStart, from + bEnd) : 1;
    const baseL = useLocal
      ? mean(left, from + bStart, from + bEnd)
      : mean(left, from, from + msToSamples(500, hz));
    const baseR = useLocal
      ? mean(right, from + bStart, from + bEnd)
      : mean(right, from, from + msToSamples(500, hz));
    const xl = (idx: number): number => sign * (total[from + idx]! - baseAbs);
    const sustain = Math.max(2, msToSamples(c.sustainMs, hz));
    const searchFrom = Math.max(prevEnd, rs - msToSamples(500, hz));
    let crossing = -1;
    let method: Contraction['method'] = c.method;
    if (c.method === 'yank') {
      // kausale Differenz über smoothMs (nur Vergangenheit): das Fenster „sieht“ den Anstieg erst, wenn er stattgefunden hat
      const h2 = Math.max(2, Math.round((c.smoothMs * hz) / 1000));
      const yThr = xl(pk) < c.peakSplitN ? c.yankLowNs : c.yankHighNs;
      let run = 0;
      for (let k = Math.max(searchFrom, h2); k <= pk; k++) {
        const y = (sign * (total[from + k]! - total[from + k - h2]!)) / (h2 / hz);
        if (y >= yThr) {
          if (++run >= sustain) {
            crossing = k - sustain + 1;
            break;
          }
        } else run = 0;
      }
      if (crossing < 0) method = 'sd5'; // Rückfall
    }
    if (crossing < 0) {
      const t5 = Math.max(3, c.sdK * baseSd);
      let run = 0;
      for (let k = searchFrom; k <= pk; k++) {
        if (xl(k) > t5) {
          if (++run >= sustain) {
            crossing = k - sustain + 1;
            break;
          }
        } else run = 0;
      }
      method = 'sd5';
    }
    if (crossing < 0) continue;
    // zurück bis zum Rauschniveau
    let onset = crossing;
    const noise = Math.max(2 * baseSd, 3);
    while (onset > searchFrom && xl(onset - 1) > noise) onset--;
    out.push({
      onset: from + onset,
      peakIdx: from + pk,
      end: from + re,
      baseline: baseAbs,
      baseLeft: baseL,
      baseRight: baseR,
      baseSd,
      sign,
      crossingIdx: from + crossing,
      method,
    });
    prevEnd = re;
  }
  return out;
}

/** Gewicht in Testposition (N) aus der Session-Masse, sonst Basislinie. */
export const isoBodyWeight = (massKg: number | null, baseline: number): number =>
  massKg && massKg > 0 ? massKg * G : baseline;
