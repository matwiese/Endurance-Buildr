import type { AnalysisConfig } from './config/index.ts';
import { mean, msToSamples, sd } from './stats.ts';
import type { Interval } from './types.ts';

export interface OnsetResult {
  /** Onset-Sample (Integration startet hier mit v = 0) */
  index: number;
  /** erstes Sample des letzten anhaltend ausgelenkten Laufs */
  crossingIdx: number;
  method: 'threshold' | 'sd5';
  /** verwendete Schwelle (N) und Referenzniveau (N) */
  thresholdN: number;
  referenceN: number;
}

/**
 * Bewegungsbeginn, rückwärts vom Abheben (verifiziert gegen /reference, ASSUMPTIONS R1):
 *  1. Ausgelenkt = |F − ref| > Schwelle; ein Lauf ist „anhaltend“ ab sustainMs (min. 2 Samples).
 *  2. Ausgehend vom letzten anhaltenden Lauf vor `anchor` werden davorliegende Läufe verschmolzen, solange die
 *     Lücke (Durchgang durch das Band, z. B. Nettokraft-Nulldurchgang) ≤ mergeGapMs ist.
 *  3. Onset = Sample vor dem Beginn des ersten verschmolzenen Laufs.
 * Dadurch bleiben Schwankungen im (auch einbeinigen) Ruhestand VOR der Bewegung unbeachtet.
 *  - 'threshold': ref = BW (Session-Gewicht), Schwelle = thresholdN (20 N)
 *  - 'sd5':       ref = Ruhemittel, Schwelle = max(sdMin, sdK·SD) der Ruhephase `quiet`
 * `anchor` = exklusives Ende des Suchbereichs (i. d. R. erstes unbelastetes Sample des Abhebens).
 */
export function detectOnset(
  total: ArrayLike<number>,
  hz: number,
  bw: number,
  cfg: AnalysisConfig,
  from: number,
  anchor: number,
  quiet?: Interval,
): OnsetResult | null {
  const c = cfg.onset;
  let ref = bw;
  let thr = c.thresholdN;
  let method: OnsetResult['method'] = 'threshold';
  if (c.method === 'sd5' && quiet) {
    const w = msToSamples(1000, hz);
    const q1 = Math.min(quiet.end, quiet.start + w);
    if (q1 - quiet.start >= 5) {
      ref = mean(total, quiet.start, q1);
      thr = Math.max(c.sdMinThresholdN, c.sdK * sd(total, quiet.start, q1));
      method = 'sd5';
    }
  }
  const n = Math.max(2, msToSamples(c.sustainMs, hz));
  const gap = msToSamples(c.mergeGapMs, hz);
  const lo = Math.max(0, from);
  const runs: Array<[number, number]> = [];
  let i = lo;
  while (i < anchor) {
    if (Math.abs(total[i]! - ref) > thr) {
      const s = i;
      while (i < anchor && Math.abs(total[i]! - ref) > thr) i++;
      if (i - s >= n) runs.push([s, i]);
    } else i++;
  }
  if (!runs.length) return null;
  let k = runs.length - 1;
  let start = runs[k]![0];
  while (k > 0 && runs[k]![0] - runs[k - 1]![1] <= gap) {
    k--;
    start = runs[k]![0];
  }
  return { index: Math.max(lo, start - 1), crossingIdx: start, method, thresholdN: thr, referenceN: ref };
}
