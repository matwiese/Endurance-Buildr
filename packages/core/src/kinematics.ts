import { interpAt } from './stats.ts';

/**
 * Kinematik des Körperschwerpunkts (COM) durch Integration der Nettokraft – Referenz-Konvention (/reference):
 *   a = (F − BW)/m,  v[i0] = 0,  Trapezregel;  s = ∫v;  Impuls = ∫(F − BW) (netto).
 * Arrays sind relativ zu `i0` indiziert (Index k ↔ Sample i0 + k).
 */
export interface Kinematics {
  /** globaler Index des ersten Samples (Onset) */
  i0: number;
  hz: number;
  acc: Float64Array;
  vel: Float64Array;
  pos: Float64Array;
  /** kumulierter Netto-Impuls (N·s) */
  impulse: Float64Array;
}

export function integrateKinematics(
  total: ArrayLike<number>,
  hz: number,
  i0: number,
  i1: number,
  bwN: number,
  massKg: number,
  v0 = 0,
): Kinematics {
  const n = Math.max(0, Math.min(i1, total.length) - i0);
  const acc = new Float64Array(n);
  const vel = new Float64Array(n);
  const pos = new Float64Array(n);
  const impulse = new Float64Array(n);
  const dt = 1 / hz;
  for (let k = 0; k < n; k++) acc[k] = (total[i0 + k]! - bwN) / massKg;
  if (n > 0) vel[0] = v0;
  for (let k = 1; k < n; k++) {
    vel[k] = vel[k - 1]! + 0.5 * (acc[k]! + acc[k - 1]!) * dt;
    pos[k] = pos[k - 1]! + 0.5 * (vel[k]! + vel[k - 1]!) * dt;
    impulse[k] = impulse[k - 1]! + 0.5 * (acc[k]! + acc[k - 1]!) * massKg * dt;
  }
  return { i0, hz, acc, vel, pos, impulse };
}

/** Geschwindigkeit an gebrochenem globalem Index (Trapez über das Teilintervall, a linear interpoliert). */
export function velAt(kin: Kinematics, idx: number): number {
  const x = idx - kin.i0;
  if (kin.vel.length === 0) return NaN;
  if (x <= 0) return kin.vel[0]!;
  if (x >= kin.vel.length - 1) return kin.vel[kin.vel.length - 1]!;
  const k = Math.floor(x);
  const f = x - k;
  const aAt = kin.acc[k]! + f * (kin.acc[k + 1]! - kin.acc[k]!);
  return kin.vel[k]! + f * (1 / kin.hz) * 0.5 * (kin.acc[k]! + aAt);
}

/** COM-Verschiebung an gebrochenem globalem Index. */
export function posAt(kin: Kinematics, idx: number): number {
  const x = idx - kin.i0;
  if (kin.pos.length === 0) return NaN;
  if (x <= 0) return kin.pos[0]!;
  if (x >= kin.pos.length - 1) return kin.pos[kin.pos.length - 1]!;
  const k = Math.floor(x);
  const f = x - k;
  const vAt = velAt(kin, idx);
  return kin.pos[k]! + f * (1 / kin.hz) * 0.5 * (kin.vel[k]! + vAt);
}

export function impulseAt(kin: Kinematics, idx: number): number {
  return interpAt(kin.impulse, idx - kin.i0);
}

export function accAt(kin: Kinematics, idx: number): number {
  return interpAt(kin.acc, idx - kin.i0);
}

/** Erster (gebrochener) globaler Index ≥ `from`, an dem die Geschwindigkeit von unten nach oben 0 kreuzt. */
export function firstUpwardZeroCrossing(kin: Kinematics, from: number, to: number): number | null {
  const k0 = Math.max(0, Math.floor(from - kin.i0));
  const k1 = Math.min(kin.vel.length - 1, Math.ceil(to - kin.i0));
  for (let k = k0; k < k1; k++) {
    const a = kin.vel[k]!;
    const b = kin.vel[k + 1]!;
    if (a < 0 && b >= 0) return kin.i0 + k + -a / (b - a);
  }
  return null;
}
