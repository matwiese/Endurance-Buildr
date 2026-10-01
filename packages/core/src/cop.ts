/** Plattengeometrie (mm). Zwei Platten nebeneinander: Mittelpunkte bei x = ∓(Breite/2 + Spalt/2). */
export interface PlateGeometry {
  widthMm: number;
  lengthMm: number;
  gapMm: number;
}

export const DEFAULT_PLATE_GEOMETRY: PlateGeometry = { widthMm: 400, lengthMm: 600, gapMm: 100 };

export const plateCenterX = (g: PlateGeometry, side: 'left' | 'right'): number =>
  (side === 'left' ? -1 : 1) * (g.widthMm / 2 + g.gapMm / 2);

/**
 * CoP (mm, globales Koordinatensystem: x = ML nach rechts, y = AP nach vorn) aus je vier Eckensensoren pro Platte.
 * Ecken je Sample: [lFL, lFR, lBL, lBR, rFL, rFR, rBL, rBR]. Bei Summe < `minLoadN` wird der Vorwert gehalten.
 */
export function copFromCorners(
  corners: ArrayLike<number>,
  g: PlateGeometry = DEFAULT_PLATE_GEOMETRY,
  minLoadN = 20,
): { x: Float32Array; y: Float32Array } {
  const n = Math.floor(corners.length / 8);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const cL = plateCenterX(g, 'left');
  const cR = plateCenterX(g, 'right');
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 8;
    const lFL = corners[o]!;
    const lFR = corners[o + 1]!;
    const lBL = corners[o + 2]!;
    const lBR = corners[o + 3]!;
    const rFL = corners[o + 4]!;
    const rFR = corners[o + 5]!;
    const rBL = corners[o + 6]!;
    const rBR = corners[o + 7]!;
    const FL = lFL + lFR + lBL + lBR;
    const FR = rFL + rFR + rBL + rBR;
    const F = FL + FR;
    if (F < minLoadN) {
      x[i] = px;
      y[i] = py;
      continue;
    }
    const xl = FL > 1 ? (g.widthMm / 2) * ((lFR + lBR - lFL - lBL) / FL) : 0;
    const yl = FL > 1 ? (g.lengthMm / 2) * ((lFL + lFR - lBL - lBR) / FL) : 0;
    const xr = FR > 1 ? (g.widthMm / 2) * ((rFR + rBR - rFL - rBL) / FR) : 0;
    const yr = FR > 1 ? (g.lengthMm / 2) * ((rFL + rFR - rBL - rBR) / FR) : 0;
    px = (FL * (cL + xl) + FR * (cR + xr)) / F;
    py = (FL * yl + FR * yr) / F;
    x[i] = px;
    y[i] = py;
  }
  return { x, y };
}

/** Rückfall ohne Eckensensoren: nur ML-Schätzung aus den Plattenkräften (AP unbekannt). */
export function copMlFromPlates(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  g: PlateGeometry = DEFAULT_PLATE_GEOMETRY,
  minLoadN = 20,
): Float32Array {
  const n = Math.min(left.length, right.length);
  const out = new Float32Array(n);
  const cL = plateCenterX(g, 'left');
  const cR = plateCenterX(g, 'right');
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const F = left[i]! + right[i]!;
    if (F < minLoadN) {
      out[i] = prev;
      continue;
    }
    prev = (left[i]! * cL + right[i]! * cR) / F;
    out[i] = prev;
  }
  return out;
}
