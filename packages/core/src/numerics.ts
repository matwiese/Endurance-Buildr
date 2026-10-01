import { interpAt } from './stats.ts';

/**
 * Trapezintegral von (x(i) − offset) über den gebrochenen Indexbereich [a, b] (Sample-Einheiten) → Ergebnis in Sample·Einheit.
 * Mit dt multiplizieren, um Sekunden zu erhalten. Außerhalb des Arrays wird geklemmt.
 */
export function trapzRange(x: ArrayLike<number>, a: number, b: number, offset = 0): number {
  if (!(b > a)) return 0;
  const n = x.length;
  const lo = Math.max(0, a);
  const hi = Math.min(n - 1, b);
  if (!(hi > lo)) return 0;
  const i0 = Math.ceil(lo);
  const i1 = Math.floor(hi);
  let s = 0;
  if (i1 < i0) {
    // beide Grenzen innerhalb eines Intervalls
    return (hi - lo) * 0.5 * (interpAt(x, lo) + interpAt(x, hi) - 2 * offset);
  }
  if (i0 > lo) s += (i0 - lo) * 0.5 * (interpAt(x, lo) + x[i0]! - 2 * offset);
  for (let i = i0; i < i1; i++) s += 0.5 * (x[i]! + x[i + 1]! - 2 * offset);
  if (hi > i1) s += (hi - i1) * 0.5 * (x[i1]! + interpAt(x, hi) - 2 * offset);
  return s;
}

/** Zeitlicher Mittelwert über [a, b] (gebrochene Indizes). */
export function meanRange(x: ArrayLike<number>, a: number, b: number): number {
  if (!(b > a)) return interpAt(x, a);
  return trapzRange(x, a, b) / (b - a);
}

/**
 * Maximum über die Samples im Bereich [a, b] (nur echte Messwerte; interpolierte Ränder nur, wenn kein Sample im Bereich
 * liegt) und dessen Index. Spitzenwerte sind Messwerte – an Unstetigkeiten (Stufenprofile) würde Interpolation Werte erfinden.
 */
export function maxRange(x: ArrayLike<number>, a: number, b: number): { value: number; index: number } {
  const i0 = Math.max(0, Math.ceil(a));
  const i1 = Math.min(x.length - 1, Math.floor(b));
  if (i1 < i0) {
    const v = Math.max(interpAt(x, a), interpAt(x, b));
    return { value: v, index: interpAt(x, a) >= interpAt(x, b) ? a : b };
  }
  let value = x[i0]!;
  let index = i0;
  for (let i = i0 + 1; i <= i1; i++) {
    if (x[i]! > value) {
      value = x[i]!;
      index = i;
    }
  }
  return { value, index };
}

export function minRange(x: ArrayLike<number>, a: number, b: number): { value: number; index: number } {
  const i0 = Math.max(0, Math.ceil(a));
  const i1 = Math.min(x.length - 1, Math.floor(b));
  if (i1 < i0) {
    const v = Math.min(interpAt(x, a), interpAt(x, b));
    return { value: v, index: interpAt(x, a) <= interpAt(x, b) ? a : b };
  }
  let value = x[i0]!;
  let index = i0;
  for (let i = i0 + 1; i <= i1; i++) {
    if (x[i]! < value) {
      value = x[i]!;
      index = i;
    }
  }
  return { value, index };
}

/**
 * Asymmetrie in % (vorzeichenbehaftet): (größere − kleinere Seite)/größere Seite · 100,
 * `+` = rechts höher, `−` = links höher. Nichtpositive Werte → null.
 */
export function asymmetryPct(left: number, right: number): number | null {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const big = Math.max(left, right);
  if (!(big > 0)) return null;
  const v = ((right - left) / big) * 100;
  return v === 0 ? 0 : v;
}

export function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}
