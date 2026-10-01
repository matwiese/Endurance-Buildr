import { analyzeRecording, type AnalyzeOptions } from '../analysis/analyze.ts';
import type { RecordingAnalysis, RepResult } from '../analysis/types.ts';
import { mergeConfig, type AnalysisConfig, type DeepPartial } from '../config/index.ts';
import { G } from '../constants.ts';
import { computeZero, type ZeroFailReason, type ZeroResult } from '../zero.ts';
import { mean, msToSamples, sd } from '../stats.ts';
import type { TestType } from '../testTypes.ts';
import type { AnalysisWarning, ForceTrace } from '../types.ts';
import { WeighTracker, weighFromQuiet, type WeighState } from '../weigh.ts';
import { GrowableF32 } from './growable.ts';

export type LivePhase = 'idle' | 'zeroing' | 'weighing' | 'recording' | 'paused';

export type LiveEvent =
  | { type: 'phase'; phase: LivePhase }
  | {
      type: 'zero';
      ok: true;
      offsetLeft: number;
      offsetRight: number;
      sdLeft: number;
      sdRight: number;
      during: LivePhase;
    }
  | { type: 'zero'; ok: false; reason: ZeroFailReason | 'timeout'; during: LivePhase }
  | { type: 'weigh'; state: WeighState }
  | { type: 'weight'; massKg: number; source: 'weighed' | 'manual' | 'estimated' }
  | { type: 'marker'; kind: 'takeoff' | 'landing' | 'impact'; idx: number }
  | { type: 'reps'; reps: RepResult[]; warnings: AnalysisWarning[] }
  | { type: 'progress'; samples: number; seconds: number }
  | { type: 'error'; code: 'weight_required' | 'not_zeroed' | 'bad_state'; message: string };

export interface LiveOptions {
  hz: number;
  /** 'auto' oder fester Testtyp */
  mode?: 'auto' | TestType;
  externalLoadKg?: number;
  config?: DeepPartial<AnalysisConfig>;
  /** Mindestabstand (ms) zwischen 'weigh'-Ereignissen */
  weighEmitMs?: number;
}

export interface Recording {
  trace: ForceTrace;
  offsetLeft: number;
  offsetRight: number;
  bodyMassKg: number | null;
  massSource: 'weighed' | 'manual' | 'estimated' | null;
  externalLoadKg: number;
}

/**
 * Live-Verarbeitung (läuft im Web Worker, ohne DOM): Nullen → Wiegen → Aufnahme (Start/Pause/Fortsetzen/Stopp),
 * Live-Marker (Takeoff/Landung/Aufprall) und Sofortergebnisse nach Landung + Beruhigung.
 * Alle Methoden sind totalfunktional: fehlerhafte Zustände erzeugen ein 'error'-Ereignis, nie eine Exception.
 */
export class LiveAnalyzer {
  private cfg: AnalysisConfig;
  private opts: Required<Pick<LiveOptions, 'hz' | 'mode' | 'externalLoadKg' | 'weighEmitMs'>>;
  phase: LivePhase = 'idle';
  private offL = 0;
  private offR = 0;
  private zeroed = false;
  private mass: number | null = null;
  private massSource: Recording['massSource'] = null;

  // Nullen (auch Re-Zero während der Aufnahme)
  private zeroBuf: { l: GrowableF32; r: GrowableF32 } | null = null;
  private zeroDuring: LivePhase = 'idle';
  private zeroLastCheck = 0;

  // Wiegen
  private weigh: WeighTracker;
  private weighLastEmit = -Infinity;
  private weighClock = 0;

  // Aufnahme
  private rl = new GrowableF32();
  private rr = new GrowableF32();
  private breaks: number[] = [];
  private det: LiveDetector;
  private lastEmittedEnd = 0;
  private firstActivity: number | null = null;
  private lastProgress = 0;

  constructor(
    private readonly emit: (e: LiveEvent) => void,
    options: LiveOptions,
  ) {
    this.opts = { mode: 'auto', externalLoadKg: 0, weighEmitMs: 50, ...options };
    this.cfg = mergeConfig(options.config);
    this.weigh = new WeighTracker(options.hz, this.cfg.weigh);
    this.det = new LiveDetector(options.hz, this.cfg);
  }

  // ───────────── Konfiguration ─────────────
  configure(
    patch: Partial<Pick<LiveOptions, 'mode' | 'externalLoadKg'>> & { config?: DeepPartial<AnalysisConfig> },
  ): void {
    if (patch.mode) this.opts.mode = patch.mode;
    if (patch.externalLoadKg !== undefined) this.opts.externalLoadKg = patch.externalLoadKg;
    if (patch.config) {
      this.cfg = mergeConfig(patch.config);
      this.det = new LiveDetector(this.opts.hz, this.cfg);
    }
  }

  get bodyMassKg(): number | null {
    return this.mass;
  }
  get offsets(): { left: number; right: number; zeroed: boolean } {
    return { left: this.offL, right: this.offR, zeroed: this.zeroed };
  }

  /** Masse manuell setzen (z. B. aus dem Profil bzw. „Wiegen überspringen“ mit bekanntem Gewicht). */
  setMass(kg: number | null, source: 'manual' | 'weighed' | 'estimated' = 'manual'): void {
    this.mass = kg !== null && kg > 0 ? kg : null;
    this.massSource = this.mass === null ? null : source;
    if (this.mass !== null) this.emit({ type: 'weight', massKg: this.mass, source });
  }

  private setPhase(p: LivePhase): void {
    this.phase = p;
    this.emit({ type: 'phase', phase: p });
  }

  // ───────────── Nullen ─────────────
  startZero(): void {
    if (this.phase === 'recording' || this.phase === 'paused') return void this.rezero();
    this.beginZeroCollect('idle');
    this.setPhase('zeroing');
  }

  /** Manuelles Re-Zero jederzeit – auch während der Aufnahme (dann als Unterbrechung der Aufnahme). */
  rezero(): void {
    if (this.zeroBuf) return; // läuft bereits
    const during = this.phase;
    if (during === 'recording') {
      this.breaks.push(this.rl.length);
      this.det.reset();
    }
    this.beginZeroCollect(during);
  }

  private beginZeroCollect(during: LivePhase): void {
    this.zeroBuf = { l: new GrowableF32(1 << 13), r: new GrowableF32(1 << 13) };
    this.zeroDuring = during;
    this.zeroLastCheck = 0;
  }

  private checkZero(): void {
    const z = this.zeroBuf;
    if (!z) return;
    const hz = this.opts.hz;
    const w = msToSamples(this.cfg.zero.windowMs, hz);
    const n = z.l.length;
    if (n < w || n - this.zeroLastCheck < msToSamples(100, hz)) {
      if (n > msToSamples(this.cfg.zero.maxWaitMs, hz))
        this.finishZero(
          {
            ok: false,
            reason: 'unstable',
            offsetLeft: 0,
            offsetRight: 0,
            sdLeft: NaN,
            sdRight: NaN,
            startIdx: 0,
            endIdx: 0,
          },
          true,
        );
      return;
    }
    this.zeroLastCheck = n;
    // nur die jüngsten maxWaitMs betrachten
    const maxN = msToSamples(this.cfg.zero.maxWaitMs, hz);
    const a = Math.max(0, n - maxN);
    const res = computeZero(z.l.view(a, n), z.r.view(a, n), hz, this.cfg.zero);
    // Fenster muss nahe am aktuellen Ende liegen (Person ist weg), sonst weiter sammeln
    if (res.ok && n - (a + res.endIdx) <= msToSamples(400, hz)) return this.finishZero(res, false);
    if (n > maxN) this.finishZero(res.ok ? { ...res, ok: false, reason: 'unstable' } : res, true);
  }

  private finishZero(res: ZeroResult, timedOut: boolean): void {
    const during = this.zeroDuring;
    this.zeroBuf = null;
    if (res.ok) {
      this.offL = res.offsetLeft;
      this.offR = res.offsetRight;
      this.zeroed = true;
      this.emit({
        type: 'zero',
        ok: true,
        offsetLeft: res.offsetLeft,
        offsetRight: res.offsetRight,
        sdLeft: res.sdLeft,
        sdRight: res.sdRight,
        during,
      });
    } else {
      this.emit({
        type: 'zero',
        ok: false,
        reason: timedOut && res.reason === 'unstable' ? 'timeout' : (res.reason ?? 'unstable'),
        during,
      });
    }
    if (during === 'idle' || during === 'zeroing') this.setPhase('idle');
    // während der Aufnahme geht es mit (ggf. neuen) Offsets weiter; eine Unterbrechung ist bereits markiert
    if (during === 'recording') this.det.reset();
  }

  // ───────────── Wiegen ─────────────
  startWeigh(): void {
    if (!this.zeroed) this.emit({ type: 'error', code: 'not_zeroed', message: 'Bitte zuerst nullen' });
    this.weigh.reset();
    this.weighLastEmit = -Infinity;
    this.setPhase('weighing');
  }

  /** Wiegen abschließen: übernimmt die Masse des aktuellen stabilen Fensters. Gibt null zurück, wenn nicht stabil. */
  lockWeight(): number | null {
    const st = this.weigh.state;
    if (!st.stable) return null;
    const kg = st.massKg; // Wiegen erfolgt ohne externe Last
    this.setMass(kg, 'weighed');
    this.setPhase('idle');
    return kg;
  }

  cancelWeigh(): void {
    if (this.phase === 'weighing') this.setPhase('idle');
  }

  // ───────────── Aufnahme ─────────────
  startRecording(): boolean {
    if (this.phase === 'recording') return true;
    if (this.opts.mode === 'auto' && this.mass === null) {
      this.emit({
        type: 'error',
        code: 'weight_required',
        message: 'Bei Auto Detect ist das Gewicht Pflicht',
      });
      return false;
    }
    this.rl.clear();
    this.rr.clear();
    this.breaks = [];
    this.det.reset();
    this.lastEmittedEnd = 0;
    this.firstActivity = null;
    this.lastProgress = 0;
    this.setPhase('recording');
    return true;
  }

  pause(): void {
    if (this.phase !== 'recording') return;
    this.setPhase('paused');
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.breaks.push(this.rl.length);
    this.det.reset();
    this.setPhase('recording');
  }

  /** Beendet die Aufnahme und liefert Rohdaten + Gesamtanalyse (Quelle der Wahrheit für die Ergebnisse). */
  stop(): { recording: Recording; analysis: RecordingAnalysis } | null {
    if (this.phase !== 'recording' && this.phase !== 'paused') {
      this.emit({ type: 'error', code: 'bad_state', message: 'Keine Aufnahme aktiv' });
      return null;
    }
    const recording = this.snapshot();
    const analysis = this.analyzeAll(recording);
    if (analysis.massSource === 'quiet' && this.mass === null && analysis.bodyMassKg)
      this.setMass(analysis.bodyMassKg, 'estimated');
    this.setPhase('idle');
    return { recording, analysis };
  }

  private snapshot(): Recording {
    const n = this.rl.length;
    const breaks = [...this.breaks].filter((b) => b > 0 && b < n);
    return {
      trace: { hz: this.opts.hz, left: this.rl.copy(), right: this.rr.copy(), breaks },
      offsetLeft: this.offL,
      offsetRight: this.offR,
      bodyMassKg: this.mass,
      massSource: this.massSource,
      externalLoadKg: this.opts.externalLoadKg,
    };
  }

  private analyzeOpts(): AnalyzeOptions {
    return {
      mode: this.opts.mode,
      bodyMassKg: this.mass ?? undefined,
      externalLoadKg: this.opts.externalLoadKg,
      config: this.cfg as DeepPartial<AnalysisConfig>,
    };
  }

  /** Analyse der gesamten Aufnahme (z. B. nach Stopp oder auf Anforderung). */
  analyzeAll(rec: Recording = this.snapshot()): RecordingAnalysis {
    return analyzeRecording(rec.trace, this.analyzeOpts());
  }

  // ───────────── Datenfluss ─────────────
  /** Rohsamples (ungenullt) eines Chunks. */
  push(left: ArrayLike<number>, right: ArrayLike<number>, breakBefore = false): void {
    const n = Math.min(left.length, right.length);
    if (n === 0) return;
    if (this.zeroBuf) {
      this.zeroBuf.l.push(left, 0, n);
      this.zeroBuf.r.push(right, 0, n);
      this.checkZero();
      return;
    }
    const zl = new Float32Array(n);
    const zr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      zl[i] = left[i]! - this.offL;
      zr[i] = right[i]! - this.offR;
    }
    if (this.phase === 'weighing') {
      for (let i = 0; i < n; i++) this.weigh.push(zl[i]!, zr[i]!);
      this.weighClock += (n / this.opts.hz) * 1000;
      if (this.weighClock - this.weighLastEmit >= this.opts.weighEmitMs) {
        this.weighLastEmit = this.weighClock;
        this.emit({ type: 'weigh', state: this.weigh.state });
      }
    } else if (this.phase === 'recording') {
      if (breakBefore && this.rl.length > 0) {
        this.breaks.push(this.rl.length);
        this.det.reset();
      }
      this.recordChunk(zl, zr);
    }
  }

  private recordChunk(zl: Float32Array, zr: Float32Array): void {
    const start = this.rl.length;
    this.rl.push(zl);
    this.rr.push(zr);
    const bw = this.mass !== null ? (this.mass + this.opts.externalLoadKg) * G : null;
    const events = this.det.push(zl, zr, start, bw);
    for (const m of events.markers) {
      if (this.firstActivity === null) this.firstActivity = Math.floor(m.idx);
      // „Wiegen überspringen“: Masse aus der ruhigen Phase vor der ersten Bewegung bestimmen
      if (this.mass === null && (m.kind === 'takeoff' || m.kind === 'impact'))
        this.estimateMassBefore(Math.floor(m.idx));
      this.emit({ type: 'marker', kind: m.kind, idx: m.idx });
    }
    if (events.settled) this.analyzeRecent();
    if (this.rl.length - this.lastProgress >= this.opts.hz / 4) {
      this.lastProgress = this.rl.length;
      this.emit({ type: 'progress', samples: this.rl.length, seconds: this.rl.length / this.opts.hz });
    }
  }

  private estimateMassBefore(idx: number): void {
    const end = Math.max(0, idx - msToSamples(100, this.opts.hz));
    if (end < msToSamples(300, this.opts.hz)) return;
    const l = this.rl.view(0, end);
    const r = this.rr.view(0, end);
    const total = Float64Array.from(l, (v, i) => v + r[i]!);
    const w = weighFromQuiet(total, l, this.opts.hz, this.cfg, 0, end);
    if (w && w.massKg - this.opts.externalLoadKg > 0)
      this.setMass(w.massKg - this.opts.externalLoadKg, 'estimated');
  }

  /** Sofortergebnisse: Fenster seit der letzten Auswertung (mit Vorlauf) analysieren, nur neue Reps melden. */
  private analyzeRecent(): void {
    const hz = this.opts.hz;
    const end = this.rl.length;
    const pre = msToSamples(2500, hz);
    const from = Math.max(this.lastEmittedEnd, (this.firstActivity ?? end) - pre, 0);
    // letzte Unterbrechung im Fenster respektieren
    const brk = this.breaks.filter((b) => b > from && b < end);
    const trace: ForceTrace = {
      hz,
      left: this.rl.view(from, end),
      right: this.rr.view(from, end),
      breaks: brk.map((b) => b - from),
    };
    const res = analyzeRecording(trace, this.analyzeOpts());
    if (this.mass === null && res.massSource === 'quiet' && res.bodyMassKg)
      this.setMass(res.bodyMassKg, 'estimated');
    const fresh = res.reps.filter((r) => r.endIdx + from > this.lastEmittedEnd).map((r) => shiftRep(r, from));
    if (fresh.length) {
      this.lastEmittedEnd = Math.max(...fresh.map((r) => r.endIdx));
      this.emit({ type: 'reps', reps: fresh, warnings: res.warnings });
    } else {
      this.lastEmittedEnd = Math.max(this.lastEmittedEnd, end - 1);
    }
    this.firstActivity = null;
  }
}

export function shiftRep(r: RepResult, delta: number): RepResult {
  const events: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.events)) events[k] = v + delta;
  return {
    ...r,
    startIdx: r.startIdx + delta,
    endIdx: r.endIdx + delta,
    events,
    warnings: r.warnings.map((w) => (w.at !== undefined ? { ...w, at: w.at + delta } : w)),
  };
}

interface DetectorOutput {
  markers: Array<{ kind: 'takeoff' | 'landing' | 'impact'; idx: number }>;
  /** Block abgeschlossen: Landung + Beruhigung (oder Zeitüberschreitung) */
  settled: boolean;
}

/**
 * Streaming-Detektor für Live-Marker und Block-Ende. Leichtgewichtig (O(1) je Sample); die eigentliche Analyse läuft erst,
 * wenn nach der letzten Landung ruhig gestanden wurde (settleMs) bzw. nach blockGapMs + 1,5 s Zeitüberschreitung.
 */
export class LiveDetector {
  private loaded = false;
  private haveData = false;
  private runStart = -1;
  private flightConfirmed = false;
  private contactStart = 0;
  private lastLoadedPeak: number[] = [];
  private preTakeoffPeak = 0;
  private pendingSettleSince: number | null = null;
  private recent: Float64Array;
  private rHead = 0;
  private rCount = 0;
  private impactWatchUntil = -1;
  private impactPeak = 0;
  private emptyRunFlag = false;

  constructor(
    private readonly hz: number,
    private readonly cfg: AnalysisConfig,
  ) {
    this.recent = new Float64Array(msToSamples(cfg.quiet.settleMs, hz));
  }

  reset(): void {
    this.loaded = false;
    this.haveData = false;
    this.runStart = -1;
    this.flightConfirmed = false;
    this.pendingSettleSince = null;
    this.rHead = 0;
    this.rCount = 0;
    this.impactWatchUntil = -1;
    this.emptyRunFlag = false;
  }

  push(left: Float32Array, right: Float32Array, base: number, bw: number | null): DetectorOutput {
    const f = this.cfg.flight;
    const thr = f.thresholdN;
    const minF = msToSamples(f.minFlightMs, this.hz);
    const maxF = (f.maxFlightMs / 1000) * this.hz;
    const preN = msToSamples(f.preTakeoffWindowMs, this.hz);
    const out: DetectorOutput = { markers: [], settled: false };
    const peakBuf = this.lastLoadedPeak;
    for (let i = 0; i < left.length; i++) {
      const idx = base + i;
      const F = left[i]! + right[i]!;
      this.recent[this.rHead] = F;
      this.rHead = (this.rHead + 1) % this.recent.length;
      this.rCount = Math.min(this.recent.length, this.rCount + 1);
      const nowLoaded = F >= thr;
      if (!this.haveData) {
        this.haveData = true;
        this.loaded = nowLoaded;
        if (!nowLoaded) {
          this.runStart = idx;
          this.emptyRunFlag = true; // Aufnahme beginnt unbelastet (z. B. Drop von der Box)
        }
        continue;
      }
      peakBuf.push(F);
      if (peakBuf.length > preN) peakBuf.shift();
      if (this.loaded && !nowLoaded) {
        // Kraft unmittelbar VOR dem Abheben festhalten (sonst enthält der Puffer bei der Bestätigung nur noch Nullen)
        this.preTakeoffPeak = peakBuf.length > 1 ? Math.max(...peakBuf.slice(0, peakBuf.length - 1)) : 0;
        this.loaded = false;
        this.runStart = idx;
        this.flightConfirmed = false;
        this.emptyRunFlag = false;
      } else if (!this.loaded && nowLoaded) {
        const len = idx - this.runStart;
        this.loaded = true;
        if (this.flightConfirmed && len <= maxF) {
          out.markers.push({ kind: 'landing', idx });
          this.pendingSettleSince = idx;
        } else if (len > maxF || this.emptyRunFlag) {
          // Aufprall nach leerer Platte: Drop? (Spitze innerhalb des Beobachtungsfensters entscheidet)
          this.impactWatchUntil = idx + msToSamples(this.cfg.detect.dropImpactWindowMs, this.hz);
          this.impactPeak = F;
        }
        this.flightConfirmed = false;
        this.runStart = -1;
        this.contactStart = idx;
      } else if (
        !this.loaded &&
        !this.flightConfirmed &&
        this.runStart >= 0 &&
        idx - this.runStart + 1 >= minF
      ) {
        // Abheben bestätigen: vor dem Abheben muss ausreichend Kraft vorhanden gewesen sein (sonst Abtreten)
        const ref = bw ?? 0;
        if (ref === 0 || this.preTakeoffPeak >= f.preTakeoffMinBw * ref) {
          this.flightConfirmed = true;
          out.markers.push({ kind: 'takeoff', idx: this.runStart });
          this.pendingSettleSince = null;
        }
      }
      if (this.impactWatchUntil >= 0) {
        if (F > this.impactPeak) this.impactPeak = F;
        if (idx >= this.impactWatchUntil) {
          this.impactWatchUntil = -1;
          if (bw !== null && this.impactPeak >= this.cfg.detect.dropImpactMinBw * bw) {
            out.markers.push({ kind: 'impact', idx: this.contactStart });
            this.pendingSettleSince = idx;
          }
        }
      }
      // Beruhigung nach der letzten Landung/Drop-Landung
      if (this.pendingSettleSince !== null && bw !== null) {
        const since = idx - this.pendingSettleSince;
        const settleN = this.recent.length;
        if (since >= settleN && this.rCount >= settleN) {
          const m = mean(this.recent);
          const s = sd(this.recent);
          const tol = Math.max(this.cfg.quiet.meanTolN, this.cfg.quiet.meanTolRel * bw);
          const sdThr = Math.max(this.cfg.quiet.sdN, this.cfg.quiet.sdRel * bw);
          if (s <= sdThr && Math.abs(m - bw) <= tol) {
            out.settled = true;
            this.pendingSettleSince = null;
          } else if (since >= (this.cfg.detect.blockGapMs / 1000) * this.hz + 1.5 * this.hz) {
            out.settled = true; // Zeitüberschreitung (z. B. Abtreten statt Ruhe)
            this.pendingSettleSince = null;
          }
        }
      }
    }
    return out;
  }
}
