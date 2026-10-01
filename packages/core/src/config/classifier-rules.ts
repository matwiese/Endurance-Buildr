import type { TestType } from '../testTypes.ts';

/**
 * Regelbasierter Auto-Detect – ALLE Regeln und Schwellen leben in dieser Datei (nicht im Code verstreut).
 *
 * Jeder Block (Bewegungssequenz) erhält einen Merkmalsvektor (`BlockFeatures`). Jede Regel prüft ihre Bedingungen:
 *  - `hard: true`  → nicht erfüllt ⇒ Regel-Score 0.
 *  - sonst weiche Bedingungen: Score 0..1, linear über `margin` um die Schwelle (0,5 genau auf der Schwelle).
 * Regel-Score = Σ(weight·score)/Σweight · prior. Gewinner = höchster Score; Konfidenz = Score·(1 − 0,5·Score_zweiter).
 * Konfidenz < `detect.minConfidence` ⇒ „unklar“ (die Person entscheidet).
 */
export interface BlockFeatures {
  /** Anzahl Flugphasen im Block */
  flights: number;
  /** Block beginnt mit Aufprall nach leerer Platte (Drop) */
  startsUnloaded: boolean;
  /** Gegenbewegung: Tiefe (cm, positiv) und min. Geschwindigkeit (m/s) vor dem ersten Abheben */
  cmDepthCm: number;
  cmVelocity: number;
  /** Dauer (ms) des ersten Kontakts (Onset bzw. Aufprall → erstes Abheben) */
  firstContactMs: number;
  /** größte Kontaktdauer (ms) zwischen aufeinanderfolgenden Flügen; 0 wenn nur 1 Flug */
  maxFollowingContactMs: number;
  /** einbeinig: > singleLegShare der Kontaktlast auf einer Platte */
  singleLeg: boolean;
  /** Anteil der dominanten Platte (0.5..1) */
  legShare: number;
  /** externe Last gesetzt */
  loaded: boolean;
  /** Land-and-Hold: Kraft stabilisiert sich um BW */
  endsInHold: boolean;
}

export type BaseType = 'cmj' | 'sj' | 'cmrj' | 'dj' | 'hop' | 'hop_return' | 'land_hold';

type Num = { [K in keyof BlockFeatures]: BlockFeatures[K] extends number ? K : never }[keyof BlockFeatures];
type Bool = { [K in keyof BlockFeatures]: BlockFeatures[K] extends boolean ? K : never }[keyof BlockFeatures];

export type RuleCondition =
  | { feature: Num; op: '>=' | '<='; value: number; margin: number; weight?: number; hard?: boolean }
  | { feature: Bool; op: '=='; value: boolean; weight?: number; hard?: boolean };

export interface ClassifierRule {
  id: string;
  type: BaseType;
  prior?: number;
  conditions: RuleCondition[];
}

export interface ClassifierConfig {
  rules: ClassifierRule[];
  /** Abbildung Basistyp → konkreter Typ je nach einbeinig/Last */
  typeMap: Record<BaseType, { double: TestType; single?: TestType; loaded?: TestType }>;
}

export const DEFAULT_CLASSIFIER: ClassifierConfig = {
  rules: [
    {
      id: 'cmj',
      type: 'cmj',
      conditions: [
        { feature: 'flights', op: '>=', value: 1, margin: 0.4, hard: true },
        { feature: 'flights', op: '<=', value: 1, margin: 0.4, hard: true },
        { feature: 'startsUnloaded', op: '==', value: false, hard: true },
        { feature: 'cmDepthCm', op: '>=', value: 8, margin: 4, weight: 2 },
        { feature: 'cmVelocity', op: '<=', value: -0.4, margin: 0.2, weight: 1 },
      ],
    },
    {
      id: 'sj',
      type: 'sj',
      conditions: [
        { feature: 'flights', op: '>=', value: 1, margin: 0.4, hard: true },
        { feature: 'flights', op: '<=', value: 1, margin: 0.4, hard: true },
        { feature: 'startsUnloaded', op: '==', value: false, hard: true },
        { feature: 'cmDepthCm', op: '<=', value: 8, margin: 4, weight: 2 },
        { feature: 'cmVelocity', op: '>=', value: -0.4, margin: 0.2, weight: 1 },
      ],
    },
    {
      id: 'cmrj',
      type: 'cmrj',
      conditions: [
        { feature: 'flights', op: '>=', value: 2, margin: 0.4, hard: true },
        { feature: 'flights', op: '<=', value: 2, margin: 0.4, hard: true },
        { feature: 'startsUnloaded', op: '==', value: false, hard: true },
        { feature: 'cmDepthCm', op: '>=', value: 8, margin: 3, weight: 2 },
        { feature: 'firstContactMs', op: '>=', value: 450, margin: 100, weight: 2 },
        { feature: 'maxFollowingContactMs', op: '<=', value: 450, margin: 100, weight: 1.5 },
      ],
    },
    {
      id: 'hop',
      type: 'hop',
      conditions: [
        { feature: 'flights', op: '>=', value: 3, margin: 0.4, hard: true },
        { feature: 'startsUnloaded', op: '==', value: false, hard: true },
        { feature: 'maxFollowingContactMs', op: '<=', value: 450, margin: 100, weight: 2 },
        { feature: 'cmDepthCm', op: '<=', value: 12, margin: 3, weight: 1 },
      ],
    },
    {
      id: 'hop_return',
      type: 'hop_return',
      conditions: [
        { feature: 'flights', op: '>=', value: 2, margin: 0.4, hard: true },
        { feature: 'flights', op: '<=', value: 2, margin: 0.4, hard: true },
        { feature: 'singleLeg', op: '==', value: true, hard: true },
        { feature: 'startsUnloaded', op: '==', value: false, hard: true },
        { feature: 'cmDepthCm', op: '<=', value: 8, margin: 3, weight: 2 },
        { feature: 'firstContactMs', op: '<=', value: 450, margin: 100, weight: 2 },
        { feature: 'maxFollowingContactMs', op: '<=', value: 450, margin: 100, weight: 1 },
      ],
    },
    {
      id: 'dj',
      type: 'dj',
      conditions: [
        { feature: 'startsUnloaded', op: '==', value: true, hard: true },
        { feature: 'flights', op: '>=', value: 1, margin: 0.4, hard: true },
        { feature: 'flights', op: '<=', value: 1.5, margin: 0.5, weight: 1 },
        { feature: 'firstContactMs', op: '<=', value: 600, margin: 150, weight: 1 },
      ],
    },
    {
      id: 'land_hold',
      type: 'land_hold',
      conditions: [
        { feature: 'startsUnloaded', op: '==', value: true, hard: true },
        { feature: 'flights', op: '<=', value: 0, margin: 0.4, hard: true },
        { feature: 'endsInHold', op: '==', value: true, weight: 1 },
      ],
    },
  ],
  typeMap: {
    cmj: { double: 'cmj', single: 'sl_jump', loaded: 'loaded_cmj' },
    sj: { double: 'sj', single: 'sl_jump', loaded: 'loaded_sj' },
    cmrj: { double: 'cmrj', single: 'sl_cmrj' },
    dj: { double: 'dj', single: 'sl_dj' },
    hop: { double: 'hop', single: 'sl_hop' },
    hop_return: { double: 'sl_hop_return', single: 'sl_hop_return' },
    land_hold: { double: 'land_hold', single: 'sl_land_hold' },
  },
};
