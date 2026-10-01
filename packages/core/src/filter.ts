/**
 * Zero-Phase-Tiefpass (Butterworth 2. Ordnung, vorwärts + rückwärts ⇒ 4. Ordnung effektiv, Betragsgang −6 dB bei fc).
 * Ränder: gespiegelte Fortsetzung, um Einschwingen zu minimieren.
 */
export function lowpassZeroPhase(x: ArrayLike<number>, hz: number, cutoffHz: number): Float64Array {
  const n = x.length;
  if (n < 4 || cutoffHz >= hz / 2) return Float64Array.from(x as ArrayLike<number>);
  const w0 = Math.tan((Math.PI * cutoffHz) / hz);
  const k = Math.SQRT2;
  const norm = 1 / (1 + k * w0 + w0 * w0);
  const b0 = w0 * w0 * norm;
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = 2 * (w0 * w0 - 1) * norm;
  const a2 = (1 - k * w0 + w0 * w0) * norm;

  const pad = Math.min(n - 1, Math.max(8, Math.round(hz)));
  const m = n + 2 * pad;
  const ext = new Float64Array(m);
  for (let i = 0; i < pad; i++) ext[pad - 1 - i] = 2 * x[0]! - x[Math.min(n - 1, i + 1)]!;
  for (let i = 0; i < n; i++) ext[pad + i] = x[i]!;
  for (let i = 0; i < pad; i++) ext[pad + n + i] = 2 * x[n - 1]! - x[Math.max(0, n - 2 - i)]!;

  const pass = (a: Float64Array): Float64Array => {
    const y = new Float64Array(a.length);
    // Anfangszustand für konstantes Eingangssignal (stationär)
    let x1 = a[0]!;
    let x2 = a[0]!;
    let y1 = a[0]!;
    let y2 = a[0]!;
    for (let i = 0; i < a.length; i++) {
      const xi = a[i]!;
      const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      y[i] = yi;
      x2 = x1;
      x1 = xi;
      y2 = y1;
      y1 = yi;
    }
    return y;
  };
  const f = pass(ext);
  f.reverse();
  const g = pass(f);
  g.reverse();
  return g.slice(pad, pad + n);
}
