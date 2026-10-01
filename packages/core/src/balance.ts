import { copFromCorners, copMlFromPlates, plateCenterX, type PlateGeometry } from './cop.ts';
import { lowpassZeroPhase } from './filter.ts';

export interface CopSeries {
  /** gefilterter CoP (mm) im Fenster; y = null ohne Eckensensoren (nur ML-Schätzung) */
  x: Float64Array;
  y: Float64Array | null;
  hasCop: boolean;
}

/** Bereitet den CoP für ein Fenster [a, b) auf (Quelle: Spur-CoP, sonst ML-Schätzung aus den Plattenkräften). */
export function prepareCop(
  src: {
    copX?: ArrayLike<number>;
    copY?: ArrayLike<number>;
    left: ArrayLike<number>;
    right: ArrayLike<number>;
  },
  a: number,
  b: number,
  hz: number,
  cutoffHz: number,
  geometry: PlateGeometry,
  side: 'left' | 'right' | 'both',
): CopSeries {
  const n = b - a;
  let x: Float64Array;
  let y: Float64Array | null = null;
  const hasCop = !!(src.copX && src.copY && src.copX.length >= b);
  if (hasCop) {
    x = Float64Array.from({ length: n }, (_, i) => src.copX![a + i]!);
    y = Float64Array.from({ length: n }, (_, i) => src.copY![a + i]!);
  } else {
    const l = Float64Array.from({ length: n }, (_, i) => src.left[a + i]!);
    const r = Float64Array.from({ length: n }, (_, i) => src.right[a + i]!);
    x = Float64Array.from(copMlFromPlates(l, r, geometry));
  }
  if (side !== 'both') {
    const c = plateCenterX(geometry, side);
    for (let i = 0; i < n; i++) x[i] = x[i]! - c;
  }
  if (cutoffHz > 0) {
    x = lowpassZeroPhase(x, hz, cutoffHz);
    if (y) y = lowpassZeroPhase(y, hz, cutoffHz);
  }
  return { x, y, hasCop };
}

export function pathLength(x: Float64Array, y: Float64Array | null): number {
  let s = 0;
  for (let i = 1; i < x.length; i++) {
    const dx = x[i]! - x[i - 1]!;
    const dy = y ? y[i]! - y[i - 1]! : 0;
    s += Math.hypot(dx, dy);
  }
  return s;
}

export function covariance2(x: Float64Array, y: Float64Array): { sxx: number; syy: number; sxy: number } {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i]!;
    my += y[i]!;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const d = Math.max(1, n - 1);
  return { sxx: sxx / d, syy: syy / d, sxy: sxy / d };
}

/** Fläche der 95-%-Konfidenzellipse: χ²(2; 0,95)·π·√(λ₁λ₂) = χ²·π·√det Σ. */
export function ellipseArea95(x: Float64Array, y: Float64Array, chi2 = 5.991): number {
  const c = covariance2(x, y);
  const det = c.sxx * c.syy - c.sxy * c.sxy;
  return chi2 * Math.PI * Math.sqrt(Math.max(0, det));
}

/** Konvexe Hülle (Andrew) – Fläche in mm². Punkte werden auf ≤ 3000 ausgedünnt. */
export function convexHullArea(x: Float64Array, y: Float64Array): number {
  const n = x.length;
  const step = Math.max(1, Math.ceil(n / 3000));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i += step) pts.push([x[i]!, y[i]!]);
  if (pts.length < 3) return 0;
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let a = 0;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i]!;
    const q = hull[(i + 1) % hull.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

export { copFromCorners };
