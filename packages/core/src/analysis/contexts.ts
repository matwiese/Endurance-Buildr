import type { AnalysisConfig } from '../config/index.ts';
import { G } from '../constants.ts';
import type { Flight } from '../flight.ts';
import {
  firstUpwardZeroCrossing,
  integrateKinematics,
  posAt,
  velAt,
  type Kinematics,
} from '../kinematics.ts';
import { meanRange } from '../numerics.ts';
import { argMax, argMin, mean, msToSamples } from '../stats.ts';
import { TEST_TYPE_INFO, type TestType } from '../testTypes.ts';
import type { RepContext, RepEvents } from '../metrics/types.ts';

export interface TraceArrays {
  total: Float64Array;
  left: Float64Array;
  right: Float64Array;
  hz: number;
}

export interface MassInfo {
  bodyMass: number;
  loadKg: number;
}

const base = (
  t: TraceArrays,
  m: MassInfo,
  type: TestType,
  kin: Kinematics | null,
  ev: RepEvents,
  quietLeftShare: number,
  singleLeg: boolean,
): RepContext => ({
  family: TEST_TYPE_INFO[type].family,
  type,
  hz: t.hz,
  mass: m.bodyMass + m.loadKg,
  bodyMass: m.bodyMass,
  externalLoadKg: m.loadKg,
  bw: (m.bodyMass + m.loadKg) * G,
  total: t.total,
  left: t.left,
  right: t.right,
  kin,
  ev,
  quietLeftShare,
  singleLeg,
});

/** Lastanteil der linken Platte in den `windowMs` vor `idx` (Ruhe); Rückfall: Anteil über [idx, fallbackEnd]. */
export function leftShareBefore(t: TraceArrays, idx: number, windowMs: number, fallbackEnd: number): number {
  const w = msToSamples(windowMs, t.hz);
  const a = Math.max(0, Math.floor(idx) - w);
  const b = Math.floor(idx);
  let l: number;
  let tot: number;
  if (b - a >= 20) {
    l = mean(t.left, a, b);
    tot = mean(t.total, a, b);
  } else {
    l = meanRange(t.left, idx, fallbackEnd);
    tot = meanRange(t.total, idx, fallbackEnd);
  }
  return tot > 0 ? Math.min(1, Math.max(0, l / tot)) : 0.5;
}

/** Anteil (0..1) der größeren Seite an der mittleren Last über [a, b]; > singleLegShare ⇒ einbeinig. */
export function dominantShare(
  t: TraceArrays,
  a: number,
  b: number,
): { share: number; side: 'left' | 'right' } {
  const l = meanRange(t.left, a, b);
  const r = meanRange(t.right, a, b);
  const tot = l + r;
  if (!(tot > 0)) return { share: 0.5, side: 'left' };
  return l >= r ? { share: l / tot, side: 'left' } : { share: r / tot, side: 'right' };
}

// ───────────────────────────── Abdruck-Sprung (CMJ / SJ / CMRJ) ─────────────────────────────

export interface PushOffInput {
  t: TraceArrays;
  m: MassInfo;
  type: TestType;
  cfg: AnalysisConfig;
  onset: number;
  f1: Flight;
  /** Rebound-Flug (CMRJ) */
  f2?: Flight | null;
  /** exklusive Obergrenze für das Landefenster (Blockende) */
  blockEnd: number;
  singleLeg: boolean;
}

export function buildPushOffContext(inp: PushOffInput): RepContext {
  const { t, m, type, cfg, onset, f1, f2 } = inp;
  const info = TEST_TYPE_INFO[type];
  const mass = m.bodyMass + m.loadKg;
  const bw = mass * G;
  const n = t.total.length;
  const landN = msToSamples(cfg.landing.windowMs, t.hz);
  const landingEnd = Math.min(f2 ? f2.takeoff : Infinity, f1.landing + landN, inp.blockEnd, n - 1);
  const iEnd = Math.min(n, Math.ceil(landingEnd) + 1);
  const kin = integrateKinematics(t.total, t.hz, onset, iEnd, bw, mass);
  const iTo = Math.floor(f1.takeoff);

  let vMin = argMin(kin.vel, 0, Math.max(1, iTo - onset + 1)) + onset;
  const vMinVal = kin.vel[vMin - onset]!;
  const zvCross = firstUpwardZeroCrossing(kin, vMin, f1.takeoff);
  const depth = zvCross !== null ? -posAt(kin, zvCross) : 0;
  const hasCM =
    info.family !== 'sj' &&
    zvCross !== null &&
    (vMinVal <= cfg.phases.cmMinVelocity || depth >= cfg.phases.cmMinDepthM);

  const ev: RepEvents = {
    onset,
    contactStart: onset,
    takeoff: f1.takeoff,
    landing: f1.landing,
    landingEnd,
    hasCM,
    zeroVel: hasCM ? zvCross! : onset,
  };
  if (hasCM) {
    ev.vMin = vMin;
    ev.minForce = argMin(t.total, onset, vMin + 1);
  } else vMin = onset;
  ev.peakForce = argMax(t.total, Math.ceil(ev.zeroVel!), iTo + 1);
  if (f2) {
    ev.rebound = {
      contactStart: f1.landing,
      takeoff: f2.takeoff,
      landing: f2.landing,
      landingEnd: Math.min(f2.landing + landN, inp.blockEnd, n - 1),
    };
  }
  const share = leftShareBefore(t, onset, 500, f1.takeoff);
  return base(t, m, type, kin, ev, share, inp.singleLeg);
}

// ───────────────────────────── Kontakt-Reps (DJ, Hop, Landung) ─────────────────────────────

export interface ContactInput {
  t: TraceArrays;
  m: MassInfo;
  type: TestType;
  cfg: AnalysisConfig;
  /** gebrochener Beginn des Kontakts (Aufprall) und erstes belastetes Sample */
  contactStart: number;
  startIdx: number;
  /** Flug nach dem Kontakt (DJ/Hop); null bei Land-and-Hold */
  flight: Flight | null;
  blockEnd: number;
  singleLeg: boolean;
}

/**
 * Kontaktphase mit Anfangsgeschwindigkeit v0 = −v_Landung. Bei Flug folgt v0 aus der ballistischen Abheb-Geschwindigkeit
 * (v_TO = g·t_Flug/2); ohne Flug (Land-and-Hold) aus v = 0 bei der Stabilisierung.
 */
export function buildContactContext(inp: ContactInput): RepContext {
  const { t, m, type, cfg, flight } = inp;
  const mass = m.bodyMass + m.loadKg;
  const bw = mass * G;
  const n = t.total.length;
  const landN = msToSamples(cfg.landing.windowMs, t.hz);
  const i0 = inp.startIdx;
  const ev: RepEvents = { contactStart: inp.contactStart };
  let kin: Kinematics | null = null;

  if (flight) {
    const landingEnd = Math.min(flight.landing + landN, inp.blockEnd, n - 1);
    const iEnd = Math.min(n, Math.ceil(landingEnd) + 1);
    const k0 = integrateKinematics(t.total, t.hz, i0, Math.min(n, flight.takeoffIdx + 3), bw, mass, 0);
    const tf = (flight.landing - flight.takeoff) / t.hz;
    const vTo = (G * tf) / 2;
    const v0 = vTo - velAt(k0, flight.takeoff);
    kin = integrateKinematics(t.total, t.hz, i0, iEnd, bw, mass, v0);
    ev.takeoff = flight.takeoff;
    ev.landing = flight.landing;
    ev.landingEnd = landingEnd;
    ev.onset = inp.contactStart;
    const zv = firstUpwardZeroCrossing(kin, i0, flight.takeoff);
    ev.zeroVel = zv ?? inp.contactStart;
    ev.hasCM = zv !== null;
    ev.peakForce = argMax(t.total, i0, Math.floor(flight.takeoff) + 1);
  } else {
    const landingEnd = Math.min(inp.contactStart + landN, inp.blockEnd, n - 1);
    ev.landingEnd = landingEnd;
    ev.landing = inp.contactStart;
    const tol = Math.max(15, cfg.landing.stabilizationTolRel * bw);
    const hold = msToSamples(cfg.landing.stabilizationHoldMs, t.hz);
    // erstes Sample, ab dem |F − BW| ≤ tol für mindestens `hold` Samples gilt (nach dem Spitzenwert)
    const peakI = argMax(t.total, i0, Math.min(n, i0 + msToSamples(cfg.detect.dropImpactWindowMs * 3, t.hz)));
    let stab: number | null = null;
    let run = 0;
    for (let i = peakI; i < Math.min(n, inp.blockEnd + hold); i++) {
      if (Math.abs(t.total[i]! - bw) <= tol) {
        run++;
        if (run >= hold) {
          stab = i - hold + 1;
          break;
        }
      } else run = 0;
    }
    ev.stabilized = stab;
    ev.peakForce = peakI;
    if (stab !== null) {
      const k0 = integrateKinematics(t.total, t.hz, i0, stab + 1, bw, mass, 0);
      const v0 = -k0.vel[k0.vel.length - 1]!;
      kin = integrateKinematics(
        t.total,
        t.hz,
        i0,
        Math.min(n, Math.max(Math.ceil(landingEnd) + 1, stab + 1)),
        bw,
        mass,
        v0,
      );
      const zv = firstUpwardZeroCrossing(kin, i0, stab);
      ev.zeroVel = zv ?? inp.contactStart;
      ev.hasCM = zv !== null;
    }
  }
  const share = (() => {
    const a = inp.contactStart;
    const b = flight ? flight.takeoff : (ev.landingEnd ?? a + 1);
    const l = meanRange(t.left, a, b);
    const tot = meanRange(t.total, a, b);
    return tot > 0 ? Math.min(1, Math.max(0, l / tot)) : 0.5;
  })();
  return base(t, m, type, kin, ev, share, inp.singleLeg);
}

/** Landestellen-Tiefe etc. (Hilfsfunktion für Tests/UI): minimale COM-Position im Kontakt (m, ≤ 0). */
export function minPosition(kin: Kinematics, a: number, b: number): number {
  let m = 0;
  for (
    let i = Math.max(0, Math.floor(a - kin.i0));
    i <= Math.min(kin.pos.length - 1, Math.ceil(b - kin.i0));
    i++
  )
    if (kin.pos[i]! < m) m = kin.pos[i]!;
  return m;
}
