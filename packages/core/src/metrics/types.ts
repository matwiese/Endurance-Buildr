import type { Kinematics } from '../kinematics.ts';
import type { TestFamily, TestType } from '../testTypes.ts';
import type { Side } from '../types.ts';

export type MetricPhase =
  | 'overall'
  | 'unweighting'
  | 'braking'
  | 'eccentric'
  | 'concentric'
  | 'flight'
  | 'landing'
  | 'contact'
  | 'rebound'
  | 'isometric'
  | 'balance'
  | 'asymmetry';

/** Physikalische Größe – steuert die Einheitenumrechnung für die Anzeige (z. B. cm → in). */
export type Quantity =
  | 'length'
  | 'time'
  | 'velocity'
  | 'force'
  | 'impulse'
  | 'power'
  | 'powerRel'
  | 'rfd'
  | 'mass'
  | 'percent'
  | 'ratio'
  | 'stiffness'
  | 'area'
  | 'speed';

export interface Bilingual {
  de: string;
  en: string;
}

/** Ereignisse einer Rep (gebrochene globale Sample-Indizes, sofern nicht anders angegeben). */
export interface RepEvents {
  /** Beginn der Bewegung (Integrationsstart) */
  onset?: number;
  /** Beginn des Kontakts (= onset bei Abdruck aus dem Stand, = Landung bei Drop/Hop-Kontakt) */
  contactStart?: number;
  vMin?: number;
  minForce?: number;
  /** Nulldurchgang der Geschwindigkeit (Wechsel exzentrisch → konzentrisch) */
  zeroVel?: number;
  peakForce?: number;
  takeoff?: number;
  landing?: number;
  landingEnd?: number;
  hasCM?: boolean;
  rebound?: { contactStart: number; takeoff: number; landing: number | null; landingEnd: number };
  /** Land-and-Hold: Zeitpunkt der Stabilisierung */
  stabilized?: number | null;
  /** Isometrie/Balance */
  windowStart?: number;
  windowEnd?: number;
  peak?: number;
}

export interface IsoData {
  /** Onset (gebrochen) und Peak-Index */
  onset: number;
  peakIdx: number;
  /** Basislinie (N): Ruhe vor der Kontraktion */
  baselineN: number;
  /** Vorzeichen: +1 Kraft steigt, −1 Kraft sinkt (invertiert analysiert) */
  sign: 1 | -1;
  /** Kontraktionsende */
  end: number;
}

export interface BalanceData {
  /** Bereich [start, end) in Samples */
  start: number;
  end: number;
  hasCop: boolean;
  /** CoP in mm (Segment) – Float64 */
  x: Float64Array;
  y: Float64Array | null;
  side: Side | 'both';
}

export interface RepContext {
  family: TestFamily;
  type: TestType;
  hz: number;
  /** Systemmasse (Körper + Last), kg */
  mass: number;
  bodyMass: number;
  externalLoadKg: number;
  /** Gewichtskraft des Systems (N) = mass·g */
  bw: number;
  /** Kontakt-/Flug-Schwelle (N) */
  thresholdN: number;
  /** Abhebegeschwindigkeit bei F = 0 extrapolieren (siehe config.kinematics.takeoffCorrection) */
  takeoffCorrection: boolean;
  total: Float64Array;
  left: Float64Array;
  right: Float64Array;
  kin: Kinematics | null;
  ev: RepEvents;
  /** Lastanteil links in der Ruhephase vor der Rep (0..1), für Impuls-Asymmetrie */
  quietLeftShare: number;
  singleLeg: boolean;
  iso?: IsoData;
  balance?: BalanceData;
}

export interface MetricDefinition {
  key: string;
  label: Bilingual;
  /** Einheit der gespeicherten Werte (metrisch) */
  unit: string;
  quantity: Quantity;
  phase: MetricPhase;
  description: Bilingual;
  /** Formel-Dokumentation (Klartext/Unicode), landet in docs/metrics.md */
  formula: string;
  decimals: number;
  higherIsBetter: boolean | null;
  families: TestFamily[];
  /** 'asymmetry': vorzeichenbehaftet, + = rechts höher */
  kind: 'value' | 'asymmetry';
  compute: (c: RepContext) => number | null;
}

export type MetricInput = Omit<MetricDefinition, 'kind' | 'decimals' | 'higherIsBetter' | 'quantity'> &
  Partial<Pick<MetricDefinition, 'kind' | 'decimals' | 'higherIsBetter' | 'quantity'>>;
