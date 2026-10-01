import { G } from '../constants.ts';
import { impulseAt, posAt, velAt } from '../kinematics.ts';
import { maxRange, trapzRange } from '../numerics.ts';
import { interpAt } from '../stats.ts';
import type { RepContext } from './types.ts';

/** Fehlende Voraussetzung → Exception; `computeMetrics` macht daraus `null`. */
export function must<T>(v: T | undefined | null, what = 'fehlende Voraussetzung'): T {
  if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) throw new Error(what);
  return v;
}

export const sec = (c: RepContext, a: number, b: number): number => (b - a) / c.hz;

export function kin(c: RepContext) {
  return must(c.kin, 'keine Kinematik');
}

/** Pflicht-Ereignisse eines Abdruck-Sprungs (CMJ/SJ/CMRJ). */
export function jumpEv(c: RepContext) {
  const e = c.ev;
  return {
    onset: must(e.onset),
    zeroVel: must(e.zeroVel),
    takeoff: must(e.takeoff),
    landing: e.landing ?? null,
    landingEnd: e.landingEnd ?? null,
    peakForce: e.peakForce ?? null,
    vMin: e.vMin ?? null,
    minForce: e.minForce ?? null,
    hasCM: e.hasCM ?? false,
  };
}

export const cmOnly = (c: RepContext): void => {
  if (!c.ev.hasCM) throw new Error('keine Gegenbewegung');
};

/**
 * Abhebegeschwindigkeit. Die 20-N-Kante liegt ε = 20 N / (Kraftabfall) vor F = 0; in ε wirkt a ≈ (10 N − BW)/m,
 * ohne Korrektur wäre v um ≈ g·ε (≈ 1 cm/s ⇒ 0,3 cm Sprunghöhe) zu hoch.
 */
export function takeoffVelocity(c: RepContext): number {
  const e = jumpEv(c);
  const v = velAt(kin(c), e.takeoff);
  if (!c.takeoffCorrection) return v;
  const i = Math.floor(e.takeoff);
  const a = Math.max(0, i - 2);
  const b = Math.min(c.total.length - 1, i + 1);
  const slope = (c.total[a]! - c.total[b]!) / (b - a); // N pro Sample, fallend > 0
  if (!(slope > 0)) return v;
  const eps = Math.min(3, c.thresholdN / slope) / c.hz; // s
  return v + ((c.thresholdN / 2 - c.bw) / c.mass) * eps;
}

export const heightFromVelocity = (v: number): number => (v * v) / (2 * G);
export const heightFromFlightTime = (t: number): number => (G * t * t) / 8;

/** Sprunghöhe aus der Flugzeit (m) einer Flugphase [takeoff, landing]. */
export function flightHeightM(c: RepContext): number {
  const e = jumpEv(c);
  return heightFromFlightTime(sec(c, e.takeoff, must(e.landing, 'keine Landung')));
}

export function netImpulse(c: RepContext, a: number, b: number): number {
  const k = kin(c);
  return impulseAt(k, b) - impulseAt(k, a);
}

/** Maximaler Kraftwert im Bereich (Gesamt oder Einzelplatte). */
export function peakIn(arr: Float64Array, a: number, b: number): number {
  return maxRange(arr, a, b).value;
}

export function posCm(c: RepContext, idx: number): number {
  return posAt(kin(c), idx) * 100;
}

export function forceAt(c: RepContext, idx: number): number {
  return interpAt(c.total, idx);
}

/** Größter Anstieg ΔF/Δt über ein Fenster der Länge `windowMs`, Startpunkte innerhalb [a, b − w]. */
export function maxRfd(c: RepContext, a: number, b: number, windowMs: number): number | null {
  const w = Math.max(1, Math.round((windowMs / 1000) * c.hz));
  const i0 = Math.ceil(a);
  const i1 = Math.floor(b) - w;
  if (i1 < i0) return null;
  let best = -Infinity;
  for (let i = i0; i <= i1; i++) {
    const r = (c.total[i + w]! - c.total[i]!) / (w / c.hz);
    if (r > best) best = r;
  }
  return best;
}

/** Netto-Impuls einer Einzelplatte über [a, b] relativ zu ihrem BW-Anteil. */
export function plateImpulse(c: RepContext, plate: 'left' | 'right', a: number, b: number): number {
  const share = plate === 'left' ? c.quietLeftShare : 1 - c.quietLeftShare;
  return trapzRange(plate === 'left' ? c.left : c.right, a, b, share * c.bw) / c.hz;
}
