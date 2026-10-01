import type { AnalysisConfig } from './config/index.ts';
import { msToSamples } from './stats.ts';

export interface Flight {
  /** gebrochener Index der Schwellenkreuzung beim Abheben (F fällt unter Schwelle) */
  takeoff: number;
  /** gebrochener Index der Schwellenkreuzung bei der Landung (F steigt über Schwelle) */
  landing: number;
  /** letztes belastetes Sample vor dem Abheben */
  takeoffIdx: number;
  /** erstes belastetes Sample nach der Landung */
  landingIdx: number;
}

export type UnloadedKind = 'flight' | 'flicker' | 'step_off' | 'empty' | 'leading' | 'trailing';

export interface UnloadedRun {
  /** erstes unbelastetes Sample */
  start: number;
  /** exklusiv: erstes belastetes Sample danach */
  end: number;
  kind: UnloadedKind;
}

/**
 * Zerlegt [from, to) in unbelastete Läufe (F < Schwelle) und klassifiziert sie:
 *  - flight:   Flugphase (Dauer min..maxFlightMs, vorher Kontakt mit Last ≥ preTakeoffMinBw·BW, danach Landung)
 *  - flicker:  zu kurz (Rauschen/Flackern)
 *  - step_off: Abtreten (Kraft fällt gleitend, erreicht vor dem Abheben nie preTakeoffMinBw·BW)
 *  - empty:    zu lang für einen Sprung (Platte leer)
 *  - leading / trailing: berühren Anfang/Ende des Bereichs (offen)
 */
export function scanUnloaded(
  total: ArrayLike<number>,
  hz: number,
  bw: number,
  cfg: AnalysisConfig['flight'],
  from = 0,
  to = total.length,
): { runs: UnloadedRun[]; flights: Flight[] } {
  const thr = cfg.thresholdN;
  const minF = msToSamples(cfg.minFlightMs, hz);
  const maxF = (cfg.maxFlightMs / 1000) * hz;
  const minC = Math.max(1, Math.round((cfg.minContactMs / 1000) * hz));
  const preN = msToSamples(cfg.preTakeoffWindowMs, hz);
  const runs: UnloadedRun[] = [];
  const flights: Flight[] = [];
  let i = from;
  let lastEnd = from; // Ende des vorherigen unbelasteten Laufs (= Beginn des aktuellen Kontakts)
  while (i < to) {
    if (total[i]! >= thr) {
      i++;
      continue;
    }
    const a = i;
    while (i < to && total[i]! < thr) i++;
    const b = i;
    const len = b - a;
    let kind: UnloadedKind;
    if (a === from) kind = 'leading';
    else if (b === to) kind = 'trailing';
    else if (len > maxF) kind = 'empty';
    else if (len < minF) kind = 'flicker';
    else if (a - lastEnd < minC) kind = 'flicker';
    else {
      let peak = -Infinity;
      for (let k = Math.max(lastEnd, a - preN); k < a; k++) if (total[k]! > peak) peak = total[k]!;
      kind = bw > 0 && peak < cfg.preTakeoffMinBw * bw ? 'step_off' : 'flight';
    }
    runs.push({ start: a, end: b, kind });
    if (kind === 'flight') {
      const f0 = total[a - 1]!;
      const f1 = total[a]!;
      const g0 = total[b - 1]!;
      const g1 = total[b]!;
      flights.push({
        takeoff: a - 1 + (f0 - thr) / (f0 - f1),
        landing: b - 1 + (thr - g0) / (g1 - g0),
        takeoffIdx: a - 1,
        landingIdx: b,
      });
    }
    lastEnd = b;
  }
  return { runs, flights };
}
