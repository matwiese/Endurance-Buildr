import type { AnalysisConfig } from '../config/index.ts';
import { scanUnloaded, type Flight, type UnloadedRun } from '../flight.ts';
import { msToSamples } from '../stats.ts';

export type BlockKind = 'jump' | 'drop' | 'landing';

export interface DropLanding {
  /** gebrochener Index der Schwellenkreuzung beim Aufprall */
  start: number;
  /** erstes belastetes Sample */
  startIdx: number;
  peakN: number;
}

/** Bewegungsblock = eine Rep-Sequenz (ein Sprung, CMRJ, Hop-Serie, Drop+Sprung oder Drop-Landung). */
export interface Block {
  index: number;
  kind: BlockKind;
  /** untere Grenze für die Onset-Suche (Ende des vorherigen Blocks bzw. Bereichsanfang) */
  from: number;
  /** Beginn der Rep: bei 'jump' vorläufig = from (Onset wird später bestimmt), bei drop/landing = Aufprall */
  startIdx: number;
  flights: Flight[];
  drop: DropLanding | null;
  /** exklusives Ende (Landung der letzten Flugphase + Landefenster, bzw. Haltephase) */
  endIdx: number;
}

export interface SegmentResult {
  blocks: Block[];
  runs: UnloadedRun[];
  flights: Flight[];
}

function impactPeak(total: ArrayLike<number>, a: number, w: number, to: number): number {
  let p = -Infinity;
  for (let i = a; i < Math.min(to, a + w); i++) if (total[i]! > p) p = total[i]!;
  return p;
}

/**
 * Flug-basierte Segmentierung: Flüge werden zu Blöcken gruppiert (Kontakt ≤ blockGapMs ⇒ gleiche Sequenz). Ein Block, dessen
 * erster Kontakt direkt auf eine leere Platte (Aufnahmebeginn/„empty“) mit deutlichem Aufprall folgt, ist eine Drop-Landung
 * (DJ bzw. Land-and-Hold). Quiet-Phasen werden hier bewusst NICHT genutzt (Einbeinstand schwankt, Quiet-Ende ≠ Onset).
 */
export function segmentBlocks(
  total: ArrayLike<number>,
  hz: number,
  bw: number,
  cfg: AnalysisConfig,
  from = 0,
  to = total.length,
): SegmentResult {
  const { runs, flights } = scanUnloaded(total, hz, bw, cfg.flight, from, to);
  const gap = (cfg.detect.blockGapMs / 1000) * hz;
  const landN = msToSamples(cfg.landing.windowMs, hz);
  const impactN = msToSamples(cfg.detect.dropImpactWindowMs, hz);
  const impactMin = cfg.detect.dropImpactMinBw * bw;
  const thr = cfg.flight.thresholdN;

  const groups: Flight[][] = [];
  for (const f of flights) {
    const g = groups[groups.length - 1];
    if (g && f.takeoffIdx - g[g.length - 1]!.landingIdx <= gap) g.push(f);
    else groups.push([f]);
  }

  const dropFor = (afterRun: UnloadedRun | undefined): DropLanding | null => {
    if (!afterRun || (afterRun.kind !== 'leading' && afterRun.kind !== 'empty') || afterRun.end >= to)
      return null;
    const peak = impactPeak(total, afterRun.end, impactN, to);
    if (!(peak >= impactMin)) return null;
    const a = afterRun.end;
    const g0 = total[a - 1] ?? 0;
    const g1 = total[a]!;
    const start = a - 1 + (g1 === g0 ? 0 : (thr - g0) / (g1 - g0));
    return { start: a >= 1 ? start : a, startIdx: a, peakN: peak };
  };

  const blocks: Block[] = [];
  let prevEnd = from;
  for (const g of groups) {
    const first = g[0]!;
    // vorangehender „leerer“ Lauf unmittelbar vor dem Kontakt dieses ersten Fluges
    const preceding = [...runs]
      .reverse()
      .find((r) => r.end <= first.takeoffIdx && r.start < first.takeoffIdx);
    const drop = dropFor(
      preceding && (preceding.kind === 'leading' || preceding.kind === 'empty') ? preceding : undefined,
    );
    const last = g[g.length - 1]!;
    const endIdx = Math.min(to, last.landingIdx + landN);
    blocks.push({
      index: blocks.length,
      kind: drop ? 'drop' : 'jump',
      from: Math.max(prevEnd, drop ? drop.startIdx : from),
      startIdx: drop ? drop.startIdx : Math.max(prevEnd, from),
      flights: g,
      drop,
      endIdx,
    });
    prevEnd = endIdx;
  }

  // Land-and-Hold: Aufprall nach leerer Platte ohne anschließenden Flug
  const flightBlockStarts = new Set(blocks.filter((b) => b.drop).map((b) => b.drop!.startIdx));
  for (const r of runs) {
    if ((r.kind !== 'leading' && r.kind !== 'empty') || flightBlockStarts.has(r.end)) continue;
    const drop = dropFor(r);
    if (!drop) continue;
    // folgt vor dem nächsten bedeutsamen Lauf ein Flug aus einem anderen Block? dann kein Land-and-Hold
    const next = runs.find((q) => q.start >= r.end && q.kind !== 'flicker');
    const nextFlight =
      next && next.kind === 'flight' ? flights.find((f) => f.takeoffIdx + 1 === next.start) : undefined;
    if (nextFlight && blocks.some((b) => b.flights.includes(nextFlight))) continue;
    const endIdx = Math.min(
      to,
      drop.startIdx + msToSamples(cfg.landing.stabilizationHoldMs + 1500, hz),
      next ? next.start : to,
    );
    blocks.push({
      index: -1,
      kind: 'landing',
      from: drop.startIdx,
      startIdx: drop.startIdx,
      flights: [],
      drop,
      endIdx,
    });
  }
  blocks.sort((a, b) => a.startIdx - b.startIdx);
  blocks.forEach((b, i) => (b.index = i));
  return { blocks, runs, flights };
}

/**
 * Fehlversuche: lange (≥ minMs) Auslenkungen ≥ max(20 N, 10 % BW) bei durchgehendem Bodenkontakt, die in keinem Block liegen
 * (z. B. Gegenbewegung ohne Abheben). Rückgabe: Bereiche [start, end).
 */
export function findFailedAttempts(
  total: ArrayLike<number>,
  hz: number,
  bw: number,
  cfg: AnalysisConfig,
  blocks: Block[],
  from = 0,
  to = total.length,
  minMs = 200,
): Array<{ start: number; end: number }> {
  const thr = Math.max(cfg.onset.thresholdN, 0.1 * bw);
  const minN = msToSamples(minMs, hz);
  const out: Array<{ start: number; end: number }> = [];
  let i = from;
  while (i < to) {
    if (Math.abs(total[i]! - bw) <= thr) {
      i++;
      continue;
    }
    const s = i;
    let loaded = true;
    while (i < to && Math.abs(total[i]! - bw) > thr) {
      if (total[i]! < cfg.flight.thresholdN) loaded = false;
      i++;
    }
    const inBlock = blocks.some((b) => s < b.endIdx && i > b.from);
    const bounded = s > from && i < to; // Anfang und Ende liegen im Band
    if (loaded && bounded && !inBlock && i - s >= minN) out.push({ start: s, end: i });
  }
  return out;
}
