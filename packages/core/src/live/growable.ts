/** Wachsender Float32-Puffer (verdoppelt die Kapazität) für laufende Aufnahmen. */
export class GrowableF32 {
  private buf: Float32Array;
  length = 0;
  constructor(initial = 1 << 15) {
    this.buf = new Float32Array(initial);
  }
  push(src: ArrayLike<number>, from = 0, to = src.length): void {
    const n = to - from;
    if (this.length + n > this.buf.length) {
      let cap = this.buf.length;
      while (cap < this.length + n) cap *= 2;
      const nb = new Float32Array(cap);
      nb.set(this.buf.subarray(0, this.length));
      this.buf = nb;
    }
    for (let i = 0; i < n; i++) this.buf[this.length + i] = src[from + i]!;
    this.length += n;
  }
  /** Ansicht (keine Kopie) auf [a, b) – gültig bis zum nächsten Wachstum */
  view(a = 0, b = this.length): Float32Array {
    return this.buf.subarray(a, b);
  }
  copy(a = 0, b = this.length): Float32Array {
    return this.buf.slice(a, b);
  }
  clear(): void {
    this.length = 0;
  }
}
