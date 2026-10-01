/**
 * Monotone kubische Hermite-Interpolation (Fritsch–Carlson/Butland): formtreu, ohne Überschwinger.
 * Optional feste Randsteigungen (z. B. für einen scharfen Onset).
 */
export function makePchip(
  xs: readonly number[],
  ys: readonly number[],
  slope0?: number,
  slopeN?: number,
): (x: number) => number {
  const n = xs.length;
  if (n < 2 || ys.length !== n) throw new Error('pchip: mindestens 2 Stützstellen');
  const h: number[] = [];
  const del: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1]! - xs[i]!);
    if (!(h[i]! > 0)) throw new Error('pchip: x muss streng steigen');
    del.push((ys[i + 1]! - ys[i]!) / h[i]!);
  }
  const d = new Array<number>(n).fill(0);
  if (n === 2) {
    d[0] = d[1] = del[0]!;
  } else {
    for (let i = 1; i < n - 1; i++) {
      if (del[i - 1]! * del[i]! <= 0) d[i] = 0;
      else {
        const w1 = 2 * h[i]! + h[i - 1]!;
        const w2 = h[i]! + 2 * h[i - 1]!;
        d[i] = (w1 + w2) / (w1 / del[i - 1]! + w2 / del[i]!);
      }
    }
    const edge = (h0: number, h1: number, d0: number, d1: number): number => {
      let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
      if (Math.sign(s) !== Math.sign(d0)) s = 0;
      else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > 3 * Math.abs(d0)) s = 3 * d0;
      return s;
    };
    d[0] = edge(h[0]!, h[1]!, del[0]!, del[1]!);
    d[n - 1] = edge(h[n - 2]!, h[n - 3]!, del[n - 2]!, del[n - 3]!);
  }
  if (slope0 !== undefined) d[0] = slope0;
  if (slopeN !== undefined) d[n - 1] = slopeN;

  return (x: number): number => {
    if (x <= xs[0]!) return ys[0]! + d[0]! * (x - xs[0]!);
    if (x >= xs[n - 1]!) return ys[n - 1]! + d[n - 1]! * (x - xs[n - 1]!);
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= x) lo = mid;
      else hi = mid;
    }
    const hh = h[lo]!;
    const t = (x - xs[lo]!) / hh;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[lo]! +
      (t3 - 2 * t2 + t) * hh * d[lo]! +
      (-2 * t3 + 3 * t2) * ys[lo + 1]! +
      (t3 - t2) * hh * d[lo + 1]!
    );
  };
}
