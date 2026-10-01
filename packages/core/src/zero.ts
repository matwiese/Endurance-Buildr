import type { AnalysisConfig } from './config/index.ts';
import { msToSamples, rollingStats } from './stats.ts';

export type ZeroFailReason = 'not_enough_data' | 'unstable' | 'not_empty';

export interface ZeroResult {
  ok: boolean;
  reason?: ZeroFailReason;
  /** abzuziehender Offset je Platte (N) */
  offsetLeft: number;
  offsetRight: number;
  sdLeft: number;
  sdRight: number;
  /** verwendetes Fenster [startIdx, endIdx) */
  startIdx: number;
  endIdx: number;
}

const fail = (reason: ZeroFailReason): ZeroResult => ({
  ok: false,
  reason,
  offsetLeft: 0,
  offsetRight: 0,
  sdLeft: NaN,
  sdRight: NaN,
  startIdx: 0,
  endIdx: 0,
});

/**
 * Nullen: Offset je Platte = Mittelwert des ruhigsten Fensters (windowMs) mit SD < Schwelle und |Mittel| < maxEmptyLoadN.
 * Steht etwas auf der Platte (ruhig, aber hohe Last) → `not_empty`; kein ruhiges Fenster → `unstable`.
 */
export function computeZero(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  hz: number,
  cfg: AnalysisConfig['zero'],
): ZeroResult {
  const w = msToSamples(cfg.windowMs, hz);
  const n = Math.min(left.length, right.length);
  if (n < w) return fail('not_enough_data');
  const L = rollingStats(left, w);
  const R = rollingStats(right, w);
  let best = -1;
  let bestScore = Infinity;
  let sawQuietButLoaded = false;
  for (let i = 0; i < L.mean.length; i++) {
    const quiet = L.sd[i]! <= cfg.sdMaxN && R.sd[i]! <= cfg.sdMaxN;
    if (!quiet) continue;
    if (Math.abs(L.mean[i]!) > cfg.maxEmptyLoadN || Math.abs(R.mean[i]!) > cfg.maxEmptyLoadN) {
      sawQuietButLoaded = true;
      continue;
    }
    const score = L.sd[i]! + R.sd[i]!;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) return fail(sawQuietButLoaded ? 'not_empty' : 'unstable');
  return {
    ok: true,
    offsetLeft: L.mean[best]!,
    offsetRight: R.mean[best]!,
    sdLeft: L.sd[best]!,
    sdRight: R.sd[best]!,
    startIdx: best,
    endIdx: best + w,
  };
}
