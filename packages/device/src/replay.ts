import { parseForceTraceCsv, type ForceTrace, type ParsedTraceFile } from '@buildr/core';
import { BaseAdapter, type DeviceInfo, type Sample } from './types.ts';

export interface ReplayOptions {
  /** Wiedergabegeschwindigkeit (1 = Echtzeit) */
  speed?: number;
  loop?: boolean;
  batchMs?: number;
  /** 'manual' = nur über advance(ms) */
  clock?: 'realtime' | 'manual';
  /** Anzeigename (z. B. Dateiname) */
  name?: string;
  now?: () => number;
}

/** Spielt eine aufgezeichnete Kraftkurve (CSV/ForceTrace) wie ein Live-Gerät ab – für Demos, Tests und Nachanalysen. */
export class FileReplayAdapter extends BaseAdapter {
  readonly info: DeviceInfo;
  private readonly trace: ForceTrace;
  private readonly o: Required<Pick<ReplayOptions, 'speed' | 'loop' | 'batchMs' | 'clock'>> & ReplayOptions;
  private pos = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAtMs = 0;
  private posAtStart = 0;
  private offsetUs = 0;
  /** aus der Datei bekannte Session-Masse (kg) */
  readonly weightKg?: number;

  constructor(trace: ForceTrace, opts: ReplayOptions = {}, weightKg?: number) {
    super();
    this.trace = trace;
    this.weightKg = weightKg;
    this.o = { speed: 1, loop: false, batchMs: 10, clock: 'realtime', ...opts };
    this.info = {
      kind: 'file-replay',
      name: opts.name ?? 'Datei-Wiedergabe',
      serial: 'REPLAY',
      plates: 2,
      supportedHz: [trace.hz],
      hasCorners: false,
    };
    this._status = { ...this._status, samplingHz: trace.hz, batteryPct: null };
  }

  static fromCsv(text: string, opts: ReplayOptions = {}): FileReplayAdapter {
    const p: ParsedTraceFile = parseForceTraceCsv(text);
    return new FileReplayAdapter(p.trace, { name: 'CSV-Wiedergabe', ...opts }, p.weightKg);
  }

  get length(): number {
    return this.trace.left.length;
  }
  get position(): number {
    return this.pos;
  }
  get finished(): boolean {
    return this.pos >= this.length;
  }

  async connect(): Promise<void> {
    this.updateStatus({ connection: 'connected', error: undefined });
    if (this.o.clock === 'realtime') this.start();
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.updateStatus({ connection: 'disconnected' });
  }

  seek(index: number): void {
    this.pos = Math.max(0, Math.min(this.length, Math.floor(index)));
    this.posAtStart = this.pos;
    this.startedAtMs = this.nowMs();
  }

  private nowMs(): number {
    return this.o.now ? this.o.now() : typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private start(): void {
    this.startedAtMs = this.nowMs();
    this.posAtStart = this.pos;
    this.timer = setInterval(() => {
      const target =
        this.posAtStart +
        Math.floor(((this.nowMs() - this.startedAtMs) / 1000) * this.o.speed * this.trace.hz);
      this.play(target - this.pos);
    }, this.o.batchMs);
  }

  /** Manueller Takt (Millisekunden Material). */
  advance(ms: number): number {
    return this.play(Math.round((ms * this.trace.hz) / 1000));
  }

  private play(n: number): number {
    let sent = 0;
    const periodUs = 1e6 / this.trace.hz;
    while (n > 0) {
      if (this.pos >= this.length) {
        if (!this.o.loop) break;
        this.pos = 0;
        this.offsetUs += this.length * periodUs;
        this.posAtStart = 0;
        this.startedAtMs = this.nowMs();
      }
      const k = Math.min(
        n,
        this.length - this.pos,
        Math.max(1, Math.round((this.trace.hz * this.o.batchMs) / 1000)),
      );
      const batch: Sample[] = [];
      for (let i = 0; i < k; i++) {
        const idx = this.pos + i;
        batch.push({
          t: this.offsetUs + idx * periodUs,
          left: this.trace.left[idx]!,
          right: this.trace.right[idx]!,
          seq: idx & 0xffff,
        });
      }
      this.pos += k;
      n -= k;
      sent += k;
      this.emitSamples(batch);
    }
    return sent;
  }
}
