import { G } from '../constants.ts';
import {
  abortedProfile,
  bounceProfile,
  catchProfile,
  emptyProfile,
  flightProfile,
  pushOffProfile,
  standProfile,
  stepOnProfile,
  type Profile,
} from './profiles.ts';

/** Bausteine für komplette Testabläufe (Profile-Listen). Wahrheit steht in den Profilen (`truth`, `events`). */
export interface TrialBase {
  /** Körpermasse (kg) */
  mass: number;
  /** externe Last (kg) – erhöht die Systemmasse */
  loadKg?: number;
}

const sys = (o: TrialBase): number => o.mass + (o.loadKg ?? 0);
const vFor = (h: number): number => Math.sqrt(2 * G * h);

export interface CmjTrial extends TrialBase {
  /** Sprunghöhe (m) */
  jumpHeight: number;
  kind?: 'cmj' | 'sj';
  unweight?: number;
  tempo?: number;
}

/** Abdruck → Flug → Landung (ohne Ruhe davor/danach). */
export function jumpTrial(o: CmjTrial): Profile[] {
  const po = pushOffProfile({
    mass: sys(o),
    jumpHeight: o.jumpHeight,
    kind: o.kind,
    unweight: o.unweight,
    tempo: o.tempo,
  });
  const v = po.truth['vTakeoff']!;
  return [po, flightProfile(v), catchProfile(sys(o), v)];
}

export interface CmrjTrial extends CmjTrial {
  reboundHeight: number;
  /** Rebound-Kontaktzeit (s) */
  contact?: number;
}

export function cmrjTrial(o: CmrjTrial): Profile[] {
  const po = pushOffProfile({
    mass: sys(o),
    jumpHeight: o.jumpHeight,
    kind: 'cmj',
    unweight: o.unweight,
    tempo: o.tempo,
  });
  const v1 = po.truth['vTakeoff']!;
  const v2 = vFor(o.reboundHeight);
  return [
    po,
    flightProfile(v1),
    bounceProfile({ mass: sys(o), vIn: v1, vOut: v2, contact: o.contact ?? 0.22 }),
    flightProfile(v2),
    catchProfile(sys(o), v2),
  ];
}

export interface HopTrial extends TrialBase {
  /** Sprunghöhe je Hop (m); Länge = Anzahl Flüge */
  heights: number[];
  /** Bodenkontaktzeit je Hop (s) für die Kontakte nach dem ersten Flug */
  contact?: number;
}

/** Hop-Serie aus dem Stand: kleiner erster Abdruck, dann n−1 Kontakte, Landung. */
export function hopTrial(o: HopTrial): Profile[] {
  const m = sys(o);
  const out: Profile[] = [];
  const first = pushOffProfile({
    mass: m,
    jumpHeight: o.heights[0]!,
    kind: 'cmj',
    unweight: 0.25,
    tempo: 0.4,
  });
  out.push(first, flightProfile(first.truth['vTakeoff']!));
  let vPrev = first.truth['vTakeoff']!;
  for (let i = 1; i < o.heights.length; i++) {
    const v = vFor(o.heights[i]!);
    out.push(
      bounceProfile({ mass: m, vIn: vPrev, vOut: v, contact: o.contact ?? 0.2, spike: 0.5 }),
      flightProfile(v),
    );
    vPrev = v;
  }
  out.push(catchProfile(m, vPrev));
  return out;
}

export interface DjTrial extends TrialBase {
  dropHeight: number;
  jumpHeight: number;
  contact?: number;
}

/** Drop-Landung → Wiederabheben → Flug → Landung (Platte vorher leer, Aufrufer stellt `emptyProfile` voran). */
export function djTrial(o: DjTrial): Profile[] {
  const m = sys(o);
  const vIn = vFor(o.dropHeight);
  const vOut = vFor(o.jumpHeight);
  return [
    bounceProfile({ mass: m, vIn, vOut, contact: o.contact ?? 0.2, spike: 1.1 }),
    flightProfile(vOut),
    catchProfile(m, vOut),
  ];
}

export interface LandHoldTrial extends TrialBase {
  dropHeight: number;
}

export function landHoldTrial(o: LandHoldTrial): Profile[] {
  return [catchProfile(sys(o), vFor(o.dropHeight))];
}

export const failedAttempt = (o: TrialBase): Profile[] => [abortedProfile(sys(o))];

/** Ruhe → (Trial) → Ruhe: Standard-Rahmen mit 2,5 s Ruhe davor und danach. */
export function withRest(o: TrialBase, trial: Profile[], before = 2.5, after = 2.5): Profile[] {
  const m = sys(o);
  return [standProfile(o.mass, before, o.loadKg), ...trial, standProfile(m, after)];
}

/** Aufnahme beginnt mit leerer Platte, Person tritt auf und steht ruhig. */
export const stepOnLeadIn = (o: TrialBase, emptyS = 1.2, standS = 2.5): Profile[] => [
  emptyProfile(emptyS),
  stepOnProfile(sys(o)),
  standProfile(o.mass, standS, o.loadKg),
];
