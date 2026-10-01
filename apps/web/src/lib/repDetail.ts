import { G, argMax, integrateKinematics, type RepResult, type TestType, TEST_TYPE_INFO } from '@buildr/core';

export type PhaseKey = 'unweighting' | 'braking' | 'concentric' | 'flight' | 'landing' | 'contact';
export interface PhaseRegion {
  key: PhaseKey;
  a: number;
  b: number;
}
export type AnnotKey = 'onset' | 'vMax' | 'zeroVel' | 'takeoff' | 'landing' | 'peak';
export interface RepAnnot {
  key: AnnotKey;
  idx: number;
}

const isPushOff = (t: TestType | 'unclear'): boolean => {
  if (t === 'unclear') return false;
  const f = TEST_TYPE_INFO[t].family;
  return f === 'cmj' || f === 'sj' || f === 'cmrj';
};

/** Phasenbereiche (Sample-Indizes) einer Rep für die farbigen Flächen in der Kurve. */
export function repPhaseRegions(rep: RepResult): PhaseRegion[] {
  const e = rep.events;
  const out: PhaseRegion[] = [];
  if (rep.type === 'unclear') return out;
  const fam = TEST_TYPE_INFO[rep.type].family;
  if (fam === 'isometric' || fam === 'balance') return out;
  if (isPushOff(rep.type) && e['onset'] !== undefined && e['takeoff'] !== undefined) {
    const zv = e['zeroVel'] ?? e['onset'];
    if (e['vMin'] !== undefined && zv > e['onset']) {
      out.push({ key: 'unweighting', a: e['onset'], b: e['vMin'] });
      out.push({ key: 'braking', a: e['vMin'], b: zv });
    }
    out.push({ key: 'concentric', a: zv, b: e['takeoff'] });
  } else if (e['contactStart'] !== undefined && e['takeoff'] !== undefined) {
    out.push({ key: 'contact', a: e['contactStart'], b: e['takeoff'] });
  } else if (fam === 'landing' && e['contactStart'] !== undefined && e['landingEnd'] !== undefined) {
    out.push({ key: 'landing', a: e['contactStart'], b: e['landingEnd'] });
  }
  if (e['takeoff'] !== undefined && e['landing'] !== undefined && fam !== 'landing') {
    out.push({ key: 'flight', a: e['takeoff'], b: e['landing'] });
    if (e['landingEnd'] !== undefined) out.push({ key: 'landing', a: e['landing'], b: e['landingEnd'] });
  }
  return out;
}

/** Schlüsselpunkte (Start, Max-Geschwindigkeit, v = 0, Abheben, Landung). Max-Geschwindigkeit wird per Integration bestimmt. */
export function repAnnotations(
  rep: RepResult,
  total: ArrayLike<number> | null,
  hz: number,
  bodyMassKg: number,
  loadKg: number,
): RepAnnot[] {
  const e = rep.events;
  const out: RepAnnot[] = [];
  const add = (key: AnnotKey, idx: number | undefined) => {
    if (idx !== undefined && Number.isFinite(idx)) out.push({ key, idx });
  };
  if (rep.type === 'unclear') return out;
  const fam = TEST_TYPE_INFO[rep.type].family;
  if (fam === 'isometric') {
    add('onset', e['onset']);
    add('peak', e['peak']);
    return out;
  }
  if (fam === 'balance') return out;
  add('onset', e['onset'] ?? e['contactStart']);
  if (isPushOff(rep.type) && total && e['onset'] !== undefined && e['takeoff'] !== undefined) {
    const mass = bodyMassKg + loadKg;
    const iEnd = Math.min(total.length, Math.ceil(e['takeoff']) + 2);
    const kin = integrateKinematics(total, hz, Math.floor(e['onset']), iEnd, mass * G, mass);
    const a = Math.max(0, Math.ceil((e['zeroVel'] ?? e['onset']) - kin.i0));
    const b = Math.min(kin.vel.length, Math.floor(e['takeoff'] - kin.i0) + 1);
    if (b > a) add('vMax', kin.i0 + argMax(kin.vel, a, b));
  }
  add('zeroVel', rep.type !== 'sj' && rep.type !== 'loaded_sj' ? e['zeroVel'] : undefined);
  add('takeoff', e['takeoff']);
  add('landing', e['landing']);
  return out;
}
