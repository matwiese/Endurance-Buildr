import type { Sample } from './types.ts';

export interface JitterStats {
  received: number;
  /** emittierte, synthetisch interpolierte Samples (kurze Lücken) */
  interpolated: number;
  /** insgesamt fehlende Samples (interpoliert + Lücken) */
  lost: number;
  /** über Paketnummern gezählte Verluste */
  lostBySeq: number;
  outOfOrder: number;
  duplicates: number;
  /** zu spät eingetroffen (hinter dem bereits ausgegebenen Zeitpunkt) */
  late: number;
  /** nicht interpolierbare Lücken (Aufnahme unterbrochen) */
  breaks: number;
  /** Verlustrate in % */
  lossRatePct: number;
}

export interface UniformChunk {
  /** nominelle Zeit (µs) des ersten Samples im Chunk */
  t0Us: number;
  left: Float32Array;
  right: Float32Array;
  corners?: Float32Array;
  /** 1 = interpoliertes Sample */
  interpolated: Uint8Array;
  /** Indizes im Chunk, an denen eine nicht überbrückbare Lücke beginnt */
  breaks: number[];
}

export interface JitterBufferOptions {
  hz: number;
  /** Zeitfenster zum Umsortieren (µs) – bestimmt auch die zusätzliche Latenz */
  reorderWindowUs?: number;
  /** größte Lücke (Samples), die linear interpoliert wird; größere ⇒ Unterbrechung */
  maxInterpolateSamples?: number;
  hasCorners?: boolean;
  /** Modulus der Paketnummer (Standard 65536) */
  seqModulo?: number;
}

/**
 * Jitterbuffer + Paketverlusterkennung: sortiert Samples (Umsortierfenster), entfernt Duplikate, rastet auf ein gleichmäßiges
 * Zeitraster ein (Jitter/Drift ±½ Periode), interpoliert kurze Lücken linear und markiert lange Lücken als Unterbrechung.
 */
export class JitterBuffer {
  private periodUs: number;
  private readonly reorderUs: number;
  private readonly maxInterp: number;
  private readonly hasCorners: boolean;
  private readonly seqMod: number;
  private pending: Sample[] = [];
  private maxT = -Infinity;
  private lastArrivalT = -Infinity;
  private nextT = 0;
  private started = false;
  private last: Sample | null = null;
  private lastSeq: number | null = null;
  readonly stats: JitterStats = {
    received: 0,
    interpolated: 0,
    lost: 0,
    lostBySeq: 0,
    outOfOrder: 0,
    duplicates: 0,
    late: 0,
    breaks: 0,
    lossRatePct: 0,
  };

  constructor(o: JitterBufferOptions) {
    this.periodUs = 1e6 / o.hz;
    this.reorderUs = o.reorderWindowUs ?? 30_000;
    this.maxInterp = o.maxInterpolateSamples ?? 30;
    this.hasCorners = o.hasCorners ?? false;
    this.seqMod = o.seqModulo ?? 65536;
  }

  setHz(hz: number): void {
    this.periodUs = 1e6 / hz;
  }

  reset(): void {
    this.pending = [];
    this.maxT = -Infinity;
    this.lastArrivalT = -Infinity;
    this.started = false;
    this.last = null;
    this.lastSeq = null;
  }

  push(samples: readonly Sample[]): UniformChunk {
    const out = new ChunkBuilder(this.hasCorners);
    for (const s of samples) {
      this.stats.received++;
      if (this.lastSeq !== null && s.seq !== undefined) {
        const d = (s.seq - this.lastSeq + this.seqMod) % this.seqMod;
        if (d > 1 && d < this.seqMod / 2) this.stats.lostBySeq += d - 1;
      }
      if (
        s.seq !== undefined &&
        (this.lastSeq === null || (s.seq - this.lastSeq + this.seqMod) % this.seqMod < this.seqMod / 2)
      )
        this.lastSeq = s.seq;
      if (s.t < this.lastArrivalT) this.stats.outOfOrder++;
      this.lastArrivalT = Math.max(this.lastArrivalT, s.t);
      this.insert(s);
      this.maxT = Math.max(this.maxT, s.t);
    }
    this.release(out, this.maxT - this.reorderUs);
    this.updateRate();
    return out.build(this.nextT);
  }

  /** Gibt alle noch wartenden Samples aus (Ende der Aufnahme). */
  flush(): UniformChunk {
    const out = new ChunkBuilder(this.hasCorners);
    this.release(out, Infinity);
    this.updateRate();
    return out.build(this.nextT);
  }

  private insert(s: Sample): void {
    const p = this.pending;
    let i = p.length;
    while (i > 0 && p[i - 1]!.t > s.t) i--;
    if (i > 0 && p[i - 1]!.t === s.t) {
      this.stats.duplicates++;
      return;
    }
    p.splice(i, 0, s);
  }

  private release(out: ChunkBuilder, upTo: number): void {
    let n = 0;
    while (n < this.pending.length && this.pending[n]!.t <= upTo) n++;
    if (!n) return;
    const ready = this.pending.splice(0, n);
    for (const s of ready) this.emit(out, s);
  }

  private emit(out: ChunkBuilder, s: Sample): void {
    const p = this.periodUs;
    if (!this.started) {
      this.nextT = s.t;
      this.started = true;
    }
    const dt = s.t - this.nextT;
    if (dt < -0.5 * p) {
      // älter als erwartet: Duplikat/Nachzügler bzw. Uhrendrift (Gerät schneller) ⇒ verwerfen
      if (this.last && s.t <= this.last.t) this.stats.late++;
      else this.stats.duplicates++;
      return;
    }
    if (dt <= 0.5 * p) {
      out.push(s, false, this.nextT);
      this.nextT += p;
    } else if (dt < 0.8 * p) {
      // leicht verspätet (Jitter/Drift): Raster neu ausrichten, kein Verlust
      this.nextT = s.t;
      out.push(s, false, this.nextT);
      this.nextT += p;
    } else {
      const k = Math.max(1, Math.round(dt / p)); // fehlende Samples
      this.stats.lost += k;
      if (k <= this.maxInterp && this.last) {
        for (let j = 1; j <= k; j++) {
          const f = j / (k + 1);
          out.push(lerp(this.last, s, f), true, this.nextT);
          this.stats.interpolated++;
          this.nextT += p;
        }
        out.push(s, false, this.nextT);
        this.nextT += p;
      } else {
        this.stats.breaks++;
        out.markBreak();
        this.nextT = s.t;
        out.push(s, false, this.nextT);
        this.nextT += p;
      }
    }
    this.last = s;
  }

  private updateRate(): void {
    const tot = this.stats.received + this.stats.lost;
    this.stats.lossRatePct = tot > 0 ? (this.stats.lost / tot) * 100 : 0;
  }
}

function lerp(a: Sample, b: Sample, f: number): Sample {
  const corners = a.corners && b.corners ? a.corners.map((v, i) => v + (b.corners![i]! - v) * f) : undefined;
  return {
    t: a.t + (b.t - a.t) * f,
    left: a.left + (b.left - a.left) * f,
    right: a.right + (b.right - a.right) * f,
    corners,
  };
}

class ChunkBuilder {
  private left: number[] = [];
  private right: number[] = [];
  private corners: number[] = [];
  private flags: number[] = [];
  private brk: number[] = [];
  private t0: number | null = null;
  constructor(private readonly withCorners: boolean) {}

  push(s: Sample, interpolated: boolean, tNominal: number): void {
    if (this.t0 === null) this.t0 = tNominal;
    this.left.push(s.left);
    this.right.push(s.right);
    this.flags.push(interpolated ? 1 : 0);
    if (this.withCorners) for (let i = 0; i < 8; i++) this.corners.push(s.corners?.[i] ?? 0);
  }

  markBreak(): void {
    this.brk.push(this.left.length);
  }

  build(fallbackT: number): UniformChunk {
    return {
      t0Us: this.t0 ?? fallbackT,
      left: Float32Array.from(this.left),
      right: Float32Array.from(this.right),
      corners: this.withCorners ? Float32Array.from(this.corners) : undefined,
      interpolated: Uint8Array.from(this.flags),
      breaks: this.brk,
    };
  }
}
