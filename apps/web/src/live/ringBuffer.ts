/**
 * Ringpuffer für die Live-Anzeige: speichert die letzten `capacity` Samples beider Platten (genullt). Die Dezimierung zum Zeichnen
 * geschieht beim Lesen (Min/Max je Pixelspalte) – im Speicher geht nichts verloren.
 */
export class RingBuffer {
  readonly capacity: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
  /** Gesamtzahl aller je geschriebenen Samples (monotone, globale Sample-Nummer) */
  count = 0;
  /** performance.now() beim letzten Schreiben (Latenzmessung) */
  lastPushMs = 0;
  /** Ankunftszeit je Chunk-Ende: (globaler Sample-Index, Zeit) für die Latenz an beliebiger Stelle */
  private arrivals: Array<{ idx: number; ms: number }> = [];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.left = new Float32Array(capacity);
    this.right = new Float32Array(capacity);
  }

  push(l: ArrayLike<number>, r: ArrayLike<number>, offL: number, offR: number, nowMs: number): void {
    const n = Math.min(l.length, r.length);
    for (let i = 0; i < n; i++) {
      const k = (this.count + i) % this.capacity;
      this.left[k] = l[i]! - offL;
      this.right[k] = r[i]! - offR;
    }
    this.count += n;
    this.lastPushMs = nowMs;
    this.arrivals.push({ idx: this.count, ms: nowMs });
    if (this.arrivals.length > 512) this.arrivals.splice(0, this.arrivals.length - 512);
  }

  /** Erster noch gespeicherter globaler Index */
  get firstIdx(): number {
    return Math.max(0, this.count - this.capacity);
  }

  at(idx: number): { l: number; r: number } {
    const k = idx % this.capacity;
    return { l: this.left[k]!, r: this.right[k]! };
  }

  /** Wann (performance.now) kam das Sample mit globalem Index `idx` an? */
  arrivalOf(idx: number): number | null {
    for (let i = this.arrivals.length - 1; i >= 0; i--) {
      if (this.arrivals[i]!.idx <= idx + 1 && (i === 0 || this.arrivals[i - 1]!.idx <= idx))
        return this.arrivals[i]!.ms;
    }
    return null;
  }

  clear(): void {
    this.count = 0;
    this.arrivals = [];
  }
}

export interface MinMaxColumns {
  min: Float32Array;
  max: Float32Array;
}

/** Min/Max je Pixelspalte über den Indexbereich [from, to) – erhält Extrema (kein Datenverlust beim Rendern). */
export function decimateMinMax(
  get: (idx: number) => number,
  from: number,
  to: number,
  columns: number,
  out?: MinMaxColumns,
): MinMaxColumns {
  const min = out?.min ?? new Float32Array(columns);
  const max = out?.max ?? new Float32Array(columns);
  const span = to - from;
  for (let c = 0; c < columns; c++) {
    const a = from + Math.floor((c * span) / columns);
    const b = Math.max(a + 1, from + Math.floor(((c + 1) * span) / columns));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = a; i < b && i < to; i++) {
      const v = get(i);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[c] = lo;
    max[c] = hi;
  }
  return { min, max };
}
