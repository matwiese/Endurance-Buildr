import type { NumArray } from './types.ts';

export function mean(a: ArrayLike<number>, i0 = 0, i1 = a.length): number {
  const n = i1 - i0;
  if (n <= 0) return NaN;
  let s = 0;
  for (let i = i0; i < i1; i++) s += a[i]!;
  return s / n;
}

/** Stichproben-Standardabweichung (n−1), numerisch stabil (Zweipass). */
export function sd(a: ArrayLike<number>, i0 = 0, i1 = a.length): number {
  const n = i1 - i0;
  if (n < 2) return 0;
  const m = mean(a, i0, i1);
  let s = 0;
  for (let i = i0; i < i1; i++) {
    const d = a[i]! - m;
    s += d * d;
  }
  return Math.sqrt(s / (n - 1));
}

export function median(a: ArrayLike<number>, i0 = 0, i1 = a.length): number {
  const n = i1 - i0;
  if (n <= 0) return NaN;
  const c = Array.from({ length: n }, (_, k) => a[i0 + k]!).sort((x, y) => x - y);
  const h = n >> 1;
  return n % 2 ? c[h]! : (c[h - 1]! + c[h]!) / 2;
}

export function sum(a: ArrayLike<number>, i0 = 0, i1 = a.length): number {
  let s = 0;
  for (let i = i0; i < i1; i++) s += a[i]!;
  return s;
}

export function argMax(a: ArrayLike<number>, i0 = 0, i1 = a.length): number {
  let best = -1;
  let bv = -Infinity;
  for (let i = i0; i < i1; i++) {
    if (a[i]! > bv) {
      bv = a[i]!;
      best = i;
    }
  }
  return best;
}

export function argMin(a: ArrayLike<number>, i0 = 0, i1 = a.length): number {
  let best = -1;
  let bv = Infinity;
  for (let i = i0; i < i1; i++) {
    if (a[i]! < bv) {
      bv = a[i]!;
      best = i;
    }
  }
  return best;
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Lineare Interpolation eines Arrays an gebrochenem Index (außerhalb: geklemmt). */
export function interpAt(a: ArrayLike<number>, idx: number): number {
  if (a.length === 0) return NaN;
  if (idx <= 0) return a[0]!;
  if (idx >= a.length - 1) return a[a.length - 1]!;
  const i = Math.floor(idx);
  const f = idx - i;
  return a[i]! * (1 - f) + a[i + 1]! * f;
}

export interface RollingStats {
  /** Fensterlänge in Samples */
  w: number;
  /** mean[i], sd[i] gehören zum Fenster [i, i+w) */
  mean: Float64Array;
  sd: Float64Array;
}

/**
 * Gleitende Mittel/SD in O(n) via Präfixsummen auf mittelwertzentrierten Daten
 * (vermeidet numerische Auslöschung bei großen Mittelwerten).
 */
export function rollingStats(x: ArrayLike<number>, w: number): RollingStats {
  const n = x.length;
  const m = Math.max(0, n - w + 1);
  const mean_ = new Float64Array(m);
  const sd_ = new Float64Array(m);
  if (m === 0 || w < 2) return { w, mean: mean_, sd: sd_ };
  const shift = mean(x);
  const c1 = new Float64Array(n + 1);
  const c2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const d = x[i]! - shift;
    c1[i + 1] = c1[i]! + d;
    c2[i + 1] = c2[i]! + d * d;
  }
  for (let i = 0; i < m; i++) {
    const s1 = c1[i + w]! - c1[i]!;
    const s2 = c2[i + w]! - c2[i]!;
    const mu = s1 / w;
    mean_[i] = mu + shift;
    const varr = (s2 - w * mu * mu) / (w - 1);
    sd_[i] = varr > 0 ? Math.sqrt(varr) : 0;
  }
  return { w, mean: mean_, sd: sd_ };
}

/** Summe zweier Kanäle (Float64). */
export function addArrays(a: NumArray, b: NumArray): Float64Array {
  const n = Math.min(a.length, b.length);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i]! + b[i]!;
  return out;
}

export const msToSamples = (ms: number, hz: number): number => Math.max(1, Math.round((ms / 1000) * hz));
