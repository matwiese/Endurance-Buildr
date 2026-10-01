import { buildContactContext, dominantShare, type MassInfo, type TraceArrays } from '../analysis/contexts.ts';
import type { AnalysisConfig } from '../config/index.ts';
import type { BlockFeatures } from '../config/classifier-rules.ts';
import { G } from '../constants.ts';
import { firstUpwardZeroCrossing, integrateKinematics, posAt } from '../kinematics.ts';
import { argMin } from '../stats.ts';
import type { Block } from './segment.ts';

/** Gegenbewegung des ersten Sprungs (Tiefe in m ≥ 0, minimale Geschwindigkeit in m/s ≤ 0). */
export function countermovementStats(
  t: TraceArrays,
  m: MassInfo,
  onset: number,
  takeoff: number,
): { depthM: number; vMin: number } {
  const mass = m.bodyMass + m.loadKg;
  const kin = integrateKinematics(
    t.total,
    t.hz,
    onset,
    Math.min(t.total.length, Math.ceil(takeoff) + 1),
    mass * G,
    mass,
  );
  const k = argMin(kin.vel, 0, Math.max(1, Math.floor(takeoff) - onset + 1));
  const vMin = kin.vel[k]!;
  const zv = firstUpwardZeroCrossing(kin, onset + k, takeoff);
  return { depthM: zv !== null ? Math.max(0, -posAt(kin, zv)) : 0, vMin: Math.min(0, vMin) };
}

export function computeBlockFeatures(
  t: TraceArrays,
  m: MassInfo,
  cfg: AnalysisConfig,
  block: Block,
  /** Onset (nur bei kind 'jump') */
  onset: number | null,
): BlockFeatures {
  const fl = block.flights;
  const hz = t.hz;
  const ms = (a: number, b: number): number => ((b - a) / hz) * 1000;
  const startsUnloaded = block.drop !== null;
  const contactStart = startsUnloaded ? block.drop!.start : (onset ?? block.startIdx);
  const f0 = fl[0];

  let cmDepthCm = 0;
  let cmVelocity = 0;
  if (f0 && !startsUnloaded && onset !== null) {
    const cm = countermovementStats(t, m, onset, f0.takeoff);
    cmDepthCm = cm.depthM * 100;
    cmVelocity = cm.vMin;
  }
  const firstContactMs = f0 ? ms(contactStart, f0.takeoff) : 0;
  let maxFollowingContactMs = 0;
  for (let k = 1; k < fl.length; k++)
    maxFollowingContactMs = Math.max(maxFollowingContactMs, ms(fl[k - 1]!.landing, fl[k]!.takeoff));

  const a = contactStart;
  const b = f0 ? f0.takeoff : block.endIdx;
  const dom = dominantShare(t, a, Math.max(a + 1, b));

  let endsInHold = false;
  if (block.kind === 'landing' && block.drop) {
    const ctx = buildContactContext({
      t,
      m,
      type: 'land_hold',
      cfg,
      contactStart: block.drop.start,
      startIdx: block.drop.startIdx,
      flight: null,
      blockEnd: block.endIdx,
      singleLeg: false,
    });
    endsInHold = ctx.ev.stabilized !== null && ctx.ev.stabilized !== undefined;
  }
  return {
    flights: fl.length,
    startsUnloaded,
    cmDepthCm,
    cmVelocity,
    firstContactMs,
    maxFollowingContactMs,
    singleLeg: dom.share >= cfg.detect.singleLegShare,
    legShare: dom.share,
    loaded: m.loadKg > 0,
    endsInHold,
  };
}
