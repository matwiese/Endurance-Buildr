import type { AnalysisConfig } from './config/index.ts';
import { G } from './constants.ts';
import { findQuietAdaptive } from './quiet.ts';
import { mean, msToSamples, rollingStats } from './stats.ts';

export interface WeighState {
  /** ≥ windowMs stabil UND Last vorhanden */
  stable: boolean;
  /** Dauer (ms), die der stabile Zustand anhält (0 wenn instabil) */
  stableMs: number;
  /** aktuelles Fenster */
  meanN: number;
  sdN: number;
  /** Körpermasse aus dem aktuellen Fenster (kg) */
  massKg: number;
  /** Lastanteil linke Platte 0..1 */
  leftShare: number;
  /** Belastung vorhanden (> minBodyForceN) */
  loaded: boolean;
}

/**
 * Streaming-Stabilitätsdetektor fürs Wiegen (Ampel). Gleitendes Fenster über Ringpuffer mit O(1)-Update.
 */
export class WeighTracker {
  readonly hz: number;
  private readonly cfg: AnalysisConfig['weigh'];
  private readonly w: number;
  private readonly tot: Float64Array;
  private readonly lft: Float64Array;
  private head = 0;
  private count = 0;
  private s1 = 0;
  private s2 = 0;
  private sl = 0;
  private sOld = 0;
  private sNew = 0;
  private c = 0;
  private sinceRebase = 0;
  private stableSamples = 0;
  state: WeighState = {
    stable: false,
    stableMs: 0,
    meanN: 0,
    sdN: 0,
    massKg: 0,
    leftShare: 0.5,
    loaded: false,
  };

  constructor(hz: number, cfg: AnalysisConfig['weigh']) {
    this.hz = hz;
    this.cfg = cfg;
    this.w = msToSamples(cfg.windowMs, hz);
    this.tot = new Float64Array(this.w);
    this.lft = new Float64Array(this.w);
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
    this.s1 = this.s2 = this.sl = 0;
    this.sOld = this.sNew = 0;
    this.sinceRebase = 0;
    this.stableSamples = 0;
    this.state = { stable: false, stableMs: 0, meanN: 0, sdN: 0, massKg: 0, leftShare: 0.5, loaded: false };
  }

  private rebase(): void {
    // Summen neu aufbauen, um Drift/Auslöschung zu begrenzen (Logische Reihenfolge: ältestes Sample bei `head`)
    const n = this.count;
    const w = this.w;
    const h = w >> 1;
    let m = 0;
    for (let i = 0; i < n; i++) m += this.tot[i]!;
    this.c = n ? m / n : 0;
    this.s1 = this.s2 = this.sl = 0;
    this.sOld = this.sNew = 0;
    for (let i = 0; i < n; i++) {
      const d = this.tot[i]! - this.c;
      this.s1 += d;
      this.s2 += d * d;
      this.sl += this.lft[i]!;
    }
    if (n === w) {
      for (let k = 0; k < w; k++) {
        const v = this.tot[(this.head + k) % w]!;
        if (k < h) this.sOld += v;
        else this.sNew += v;
      }
    }
    this.sinceRebase = 0;
  }

  push(left: number, right: number): WeighState {
    const x = left + right;
    if (this.count < this.w) {
      this.tot[this.head] = x;
      this.lft[this.head] = left;
      this.head = (this.head + 1) % this.w;
      this.count++;
      if (this.count === 1) this.c = x;
      const d = x - this.c;
      this.s1 += d;
      this.s2 += d * d;
      this.sl += left;
      if (this.count === this.w) this.rebase();
    } else {
      const h = this.w >> 1;
      const old = this.tot[this.head]!;
      const oldL = this.lft[this.head]!;
      const moved = this.tot[(this.head + h) % this.w]!; // wandert von der neuen in die alte Hälfte
      this.tot[this.head] = x;
      this.lft[this.head] = left;
      this.head = (this.head + 1) % this.w;
      const dOld = old - this.c;
      const d = x - this.c;
      this.s1 += d - dOld;
      this.s2 += d * d - dOld * dOld;
      this.sl += left - oldL;
      this.sOld += moved - old;
      this.sNew += x - moved;
      if (++this.sinceRebase >= this.w) this.rebase();
    }
    this.update();
    return this.state;
  }

  pushBatch(left: ArrayLike<number>, right: ArrayLike<number>): WeighState {
    const n = Math.min(left.length, right.length);
    for (let i = 0; i < n; i++) this.push(left[i]!, right[i]!);
    return this.state;
  }

  private update(): void {
    const n = this.count;
    const w = this.w;
    const mu = this.s1 / n + this.c;
    const varr = n > 1 ? (this.s2 - (this.s1 * this.s1) / n) / (n - 1) : 0;
    const sdv = varr > 0 ? Math.sqrt(varr) : 0;
    const loaded = mu > this.cfg.minBodyForceN;
    const thr = Math.max(this.cfg.sdN, this.cfg.sdRel * mu);
    const h = w >> 1;
    // Drift: Mittel der älteren vs. jüngeren Fensterhälfte (eine Rampe/ein Einschwingen ist nicht „stabil“)
    const drift = n >= w ? Math.abs(this.sOld / h - this.sNew / (w - h)) : Infinity;
    const driftOk = drift <= Math.max(this.cfg.driftN, this.cfg.driftRel * mu);
    const ok = n >= w && loaded && sdv <= thr && driftOk;
    this.stableSamples = ok ? this.stableSamples + 1 : 0;
    const sumL = this.sl;
    this.state = {
      stable: ok,
      stableMs: ok ? ((w + this.stableSamples - 1) / this.hz) * 1000 : 0,
      meanN: mu,
      sdN: sdv,
      massKg: mu / G,
      leftShare: mu > 0 ? sumL / n / mu : 0.5,
      loaded,
    };
  }
}

export interface WeighResult {
  massKg: number;
  startIdx: number;
  endIdx: number;
  leftShare: number;
  /** tatsächlich verwendete Fensterlänge (ms) */
  windowMs: number;
}

/**
 * Offline-Wiegen / „Wiegen überspringen“: erste ruhige Phase mit Last (kein BW-Bezug bekannt) → Masse.
 * Mittelt über das ruhigste Teilfenster (SD-minimal) der ersten ruhigen Phase.
 */
export function weighFromQuiet(
  total: ArrayLike<number>,
  left: ArrayLike<number>,
  hz: number,
  cfg: AnalysisConfig,
  from = 0,
  to = total.length,
): WeighResult | null {
  // Wiegen nutzt die strengeren Schwellen von cfg.weigh (die Block-Ruhe-Schwelle ist für Einbeinstand-Schwankung gedacht)
  const strict = { ...cfg.quiet, sdN: cfg.weigh.sdN, sdRel: cfg.weigh.sdRel };
  const { intervals, usedWindowMs } = findQuietAdaptive(
    total,
    hz,
    strict,
    { minLoadN: cfg.weigh.minBodyForceN },
    from,
    to,
  );
  const iv = intervals[0];
  if (!iv) return null;
  // ruhigstes Teilfenster der Länge `usedWindowMs` (robust gegen Einschwingen nach dem Auftreten)
  const w = Math.min(msToSamples(usedWindowMs, hz), iv.end - iv.start);
  const slice = Float64Array.from({ length: iv.end - iv.start }, (_, i) => total[iv.start + i]!);
  const rs = rollingStats(slice, w);
  let best = 0;
  for (let i = 1; i < rs.sd.length; i++) if (rs.sd[i]! < rs.sd[best]!) best = i;
  const start = iv.start + best;
  const end = start + w;
  const mu = mean(total, start, end);
  const lm = mean(left, start, end);
  return {
    massKg: mu / G,
    startIdx: start,
    endIdx: end,
    leftShare: mu > 0 ? lm / mu : 0.5,
    windowMs: usedWindowMs,
  };
}
