import type { AnalysisConfig } from './config/index.ts';
import { msToSamples, rollingStats } from './stats.ts';
import type { Interval } from './types.ts';

/** SD-Schwelle für „ruhig“ bei Referenzniveau `level` (N). */
export const quietSdThreshold = (
  cfg: Pick<AnalysisConfig['quiet'], 'sdN' | 'sdRel'>,
  level: number,
): number => Math.max(cfg.sdN, cfg.sdRel * Math.max(0, level));

export interface QuietOptions {
  /** Referenzgewicht (N): Mittelwert muss innerhalb der Toleranz liegen. Ohne: nur Mindestlast `minLoadN`. */
  bw?: number;
  minLoadN?: number;
  windowMs: number;
}

/**
 * Ruhephasen: gleitendes Fenster mit SD ≤ Schwelle und Mittelwert ≈ BW; überlappende Fenster werden zu Intervallen vereinigt.
 * Intervall = [erstes Fenster-Start, letztes Fenster-Ende).
 */
export function findQuietIntervals(
  total: ArrayLike<number>,
  hz: number,
  cfg: AnalysisConfig['quiet'],
  opts: QuietOptions,
  from = 0,
  to = total.length,
): Interval[] {
  const w = msToSamples(opts.windowMs, hz);
  const len = to - from;
  if (len < w) return [];
  const slice =
    total instanceof Float64Array || total instanceof Float32Array
      ? total.subarray(from, to)
      : Array.from({ length: len }, (_, i) => total[from + i]!);
  const rs = rollingStats(slice, w);
  const out: Interval[] = [];
  let curStart = -1;
  let curEnd = -1;
  for (let i = 0; i < rs.mean.length; i++) {
    const level = opts.bw ?? rs.mean[i]!;
    const sdOk = rs.sd[i]! <= quietSdThreshold(cfg, level);
    const meanOk =
      opts.bw !== undefined
        ? Math.abs(rs.mean[i]! - opts.bw) <= Math.max(cfg.meanTolN, cfg.meanTolRel * opts.bw)
        : rs.mean[i]! >= (opts.minLoadN ?? 0);
    if (sdOk && meanOk) {
      if (curStart < 0) curStart = i;
      curEnd = i + w;
    } else if (curStart >= 0) {
      out.push({ start: from + curStart, end: from + curEnd });
      curStart = -1;
    }
  }
  if (curStart >= 0) out.push({ start: from + curStart, end: from + curEnd });
  return out;
}

/**
 * Wie findQuietIntervals, aber mit Rückfall auf kürzere Fenster (cfg.fallbackWindowsMs), wenn mit dem vollen Fenster
 * nichts gefunden wird. `usedWindowMs` sagt, welches Fenster griff.
 */
export function findQuietAdaptive(
  total: ArrayLike<number>,
  hz: number,
  cfg: AnalysisConfig['quiet'],
  opts: Omit<QuietOptions, 'windowMs'>,
  from = 0,
  to = total.length,
): { intervals: Interval[]; usedWindowMs: number } {
  for (const windowMs of [cfg.windowMs, ...cfg.fallbackWindowsMs]) {
    const intervals = findQuietIntervals(total, hz, cfg, { ...opts, windowMs }, from, to);
    if (intervals.length) return { intervals, usedWindowMs: windowMs };
  }
  return { intervals: [], usedWindowMs: 0 };
}
