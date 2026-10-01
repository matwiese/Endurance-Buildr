export type NumArray = Float32Array | Float64Array;

/**
 * Gleichmäßig abgetastete Kraftaufnahme (nach Jitterbuffer). Kräfte in N, bereits genullt.
 * `breaks` markiert Sample-Indizes, an denen die Aufnahme unterbrochen war (Pause / Re-Zero):
 * die Analyse integriert nie über eine Unterbrechung hinweg.
 */
export interface ForceTrace {
  hz: number;
  left: NumArray;
  right: NumArray;
  /** Center of Pressure in mm (globales Plattenkoordinatensystem), optional. */
  copX?: NumArray;
  copY?: NumArray;
  breaks?: number[];
}

export type Side = 'left' | 'right';

export interface Interval {
  /** erstes Sample */
  start: number;
  /** exklusiv */
  end: number;
}

export type WarningSeverity = 'info' | 'warning' | 'error';

export interface AnalysisWarning {
  code: string;
  severity: WarningSeverity;
  /** Index der Rep (optional) */
  rep?: number;
  /** Sample-Index (optional) */
  at?: number;
  /** Freitext-Parameter für i18n-Platzhalter */
  params?: Record<string, number | string>;
}
