import type {
  AnalysisConfig,
  AnalyzeOptions,
  DeepPartial,
  ForceTrace,
  LiveEvent,
  Recording,
  RecordingAnalysis,
  TestType,
} from '@buildr/core';
import {
  JitterBuffer,
  type DeviceAdapter,
  type DeviceStatus,
  type JitterStats,
  type UniformChunk,
} from '@buildr/device';
import type { FromWorker, ToWorker, WorkerLike } from './protocol.ts';
import { RingBuffer } from './ringBuffer.ts';
import { createAnalysisWorker } from './workerClient.ts';

export interface EngineOptions {
  mode: 'auto' | TestType;
  externalLoadKg: number;
  config?: DeepPartial<AnalysisConfig>;
  /** Länge des Anzeige-Ringpuffers (s) */
  ringSeconds?: number;
  /** Umsortierfenster des Jitterbuffers (µs); zusätzliche Anzeige-Latenz */
  reorderWindowUs?: number;
  /** Batchdauer des Geräts (ms) für die Latenzabschätzung */
  deviceBatchMs?: number;
  now?: () => number;
  workerFactory?: () => WorkerLike;
}

export interface EngineStats {
  latencyMs: number;
  lossPct: number;
  jitter: JitterStats;
}

export type EngineEvent =
  | { type: 'live'; e: LiveEvent }
  | { type: 'status'; status: DeviceStatus }
  | { type: 'stats'; stats: EngineStats };

/**
 * Verbindet Gerät, Jitterbuffer, Ringpuffer (Anzeige) und Analyse-Worker:
 *   Adapter → JitterBuffer → { Ringpuffer (genullt, für den Plot) , Worker (LiveAnalyzer) } → Ereignisse.
 */
export class LiveEngine {
  readonly adapter: DeviceAdapter;
  readonly ring: RingBuffer;
  readonly offsets = { left: 0, right: 0 };
  readonly hz: number;
  private readonly jitter: JitterBuffer;
  private readonly worker: WorkerLike;
  private readonly now: () => number;
  private readonly listeners = new Set<(e: EngineEvent) => void>();
  private readonly pending = new Map<number, (m: FromWorker) => void>();
  private reqId = 1;
  private unsub: Array<() => void> = [];
  recordingActive = false;
  zeroCollecting = false;
  private latencyEma = 0;
  private readonly holdMs: number;
  private statsTimer = 0;
  private readonly opts: EngineOptions;

  constructor(adapter: DeviceAdapter, opts: EngineOptions) {
    this.adapter = adapter;
    this.opts = opts;
    this.hz = adapter.status.samplingHz;
    this.now = opts.now ?? (() => performance.now());
    const reorder = opts.reorderWindowUs ?? 20_000;
    this.holdMs = reorder / 1000 + (opts.deviceBatchMs ?? 10);
    this.ring = new RingBuffer(Math.round(this.hz * (opts.ringSeconds ?? 60)));
    this.jitter = new JitterBuffer({
      hz: this.hz,
      reorderWindowUs: reorder,
      hasCorners: adapter.info.hasCorners,
    });
    this.worker = (opts.workerFactory ?? createAnalysisWorker)();
    this.worker.onmessage = (ev) => this.onWorker(ev.data);
    this.send({
      type: 'init',
      hz: this.hz,
      mode: opts.mode,
      externalLoadKg: opts.externalLoadKg,
      config: opts.config,
    });
    this.unsub.push(adapter.onSample((b) => this.handleChunk(this.jitter.push(b))));
    this.unsub.push(adapter.onStatus((s) => this.emit({ type: 'status', status: s })));
  }

  // ───────────── Ereignisse ─────────────
  subscribe(cb: (e: EngineEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit(e: EngineEvent): void {
    for (const l of this.listeners) l(e);
  }
  private send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }

  private onWorker(m: FromWorker): void {
    if (m.type === 'event') {
      const e = m.e;
      if (e.type === 'zero') {
        this.zeroCollecting = false;
        if (e.ok) {
          this.offsets.left = e.offsetLeft;
          this.offsets.right = e.offsetRight;
        }
      }
      this.emit({ type: 'live', e });
      return;
    }
    const cb = this.pending.get(m.reqId);
    if (cb) {
      this.pending.delete(m.reqId);
      cb(m);
    }
  }

  private request<T extends FromWorker>(
    build: (reqId: number) => ToWorker,
    transfer: Transferable[] = [],
  ): Promise<T> {
    return new Promise((resolve) => {
      const id = this.reqId++;
      this.pending.set(id, (m) => resolve(m as T));
      this.send(build(id), transfer);
    });
  }

  // ───────────── Datenfluss ─────────────
  private handleChunk(c: UniformChunk): void {
    const n = c.left.length;
    if (!n) return;
    const now = this.now();
    // Unterbrechungen (nicht überbrückbare Lücken) teilen den Chunk
    const cuts = [0, ...c.breaks.filter((b) => b > 0 && b < n), n];
    const breakAtStart = c.breaks.includes(0);
    for (let p = 0; p + 1 < cuts.length; p++) {
      const a = cuts[p]!;
      const b = cuts[p + 1]!;
      const l = c.left.subarray(a, b);
      const r = c.right.subarray(a, b);
      const ringStart = this.ring.count;
      this.ring.push(l, r, this.offsets.left, this.offsets.right, now);
      this.send(
        {
          type: 'push',
          left: l.slice(),
          right: r.slice(),
          corners: c.corners ? c.corners.slice(a * 8, b * 8) : undefined,
          breakBefore: p > 0 || (p === 0 && breakAtStart),
          tag: ringStart,
        },
        [],
      );
    }
    if (this.statsTimer++ % 20 === 0) this.emitStats();
  }

  /** Anzeige-Latenz (ms): Alter des neuesten Samples seit Ankunft + Haltezeit (Jitterbuffer + Geräte-Batch) + Frame. */
  noteFrame(frameNowMs: number): number {
    if (!this.ring.count) return 0;
    const age = Math.max(0, frameNowMs - this.ring.lastPushMs);
    const l = age + this.holdMs;
    this.latencyEma = this.latencyEma === 0 ? l : this.latencyEma * 0.9 + l * 0.1;
    return l;
  }
  get latencyMs(): number {
    return this.latencyEma;
  }
  get jitterStats(): JitterStats {
    return this.jitter.stats;
  }
  private emitStats(): void {
    this.emit({
      type: 'stats',
      stats: {
        latencyMs: this.latencyEma,
        lossPct: this.jitter.stats.lossRatePct,
        jitter: { ...this.jitter.stats },
      },
    });
  }

  // ───────────── Steuerung ─────────────
  async connect(): Promise<void> {
    await this.adapter.connect();
  }
  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }
  configure(patch: {
    mode?: 'auto' | TestType;
    externalLoadKg?: number;
    config?: DeepPartial<AnalysisConfig>;
  }): void {
    this.send({ type: 'configure', ...patch });
  }
  startZero(): void {
    this.zeroCollecting = true;
    this.send({ type: 'startZero' });
  }
  rezero(): void {
    this.zeroCollecting = true;
    this.send({ type: 'rezero' });
  }
  startWeigh(): void {
    this.send({ type: 'startWeigh' });
  }
  cancelWeigh(): void {
    this.send({ type: 'cancelWeigh' });
  }
  async lockWeight(): Promise<number | null> {
    const r = await this.request<Extract<FromWorker, { type: 'locked' }>>((reqId) => ({
      type: 'lockWeight',
      reqId,
    }));
    return r.kg;
  }
  setMass(kg: number | null, source: 'manual' | 'weighed' = 'manual'): void {
    this.send({ type: 'setMass', kg, source });
  }
  async startRecording(): Promise<boolean> {
    this.recordingActive = true;
    const r = await this.request<Extract<FromWorker, { type: 'recordingStarted' }>>((reqId) => ({
      type: 'startRecording',
      reqId,
    }));
    if (!r.ok) this.recordingActive = false;
    return r.ok;
  }
  pause(): void {
    this.recordingActive = false;
    this.send({ type: 'pause' });
  }
  resume(): void {
    this.recordingActive = true;
    this.send({ type: 'resume' });
  }
  async stop(): Promise<{ recording: Recording; analysis: RecordingAnalysis } | null> {
    this.recordingActive = false;
    const r = await this.request<Extract<FromWorker, { type: 'stopped' }>>((reqId) => ({
      type: 'stop',
      reqId,
    }));
    return r.result;
  }
  async analyze(trace: ForceTrace, options: AnalyzeOptions): Promise<RecordingAnalysis> {
    const r = await this.request<Extract<FromWorker, { type: 'analysis' }>>((reqId) => ({
      type: 'analyze',
      reqId,
      trace,
      options,
    }));
    return r.analysis;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.worker.terminate();
    this.listeners.clear();
    this.pending.clear();
  }

  get options(): EngineOptions {
    return this.opts;
  }
}
