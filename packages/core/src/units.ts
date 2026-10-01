import type { MetricDefinition, Quantity } from './metrics/types.ts';

/** Intern wird immer metrisch gerechnet und gespeichert; Umrechnung nur für die Anzeige. */
export type UnitSystem = 'metric' | 'imperial';

interface UnitRule {
  /** Anzeigewert = metrisch · factor */
  factor: number;
  label: string;
}

const IMPERIAL: Partial<Record<Quantity, Record<string, UnitRule>>> = {
  length: { cm: { factor: 1 / 2.54, label: 'in' }, mm: { factor: 1 / 25.4, label: 'in' } },
  force: { N: { factor: 1 / 4.4482216, label: 'lbf' } },
  mass: { kg: { factor: 2.2046226, label: 'lb' } },
  velocity: { 'm/s': { factor: 3.2808399, label: 'ft/s' }, 'N·s/kg': { factor: 3.2808399, label: 'ft/s' } },
  speed: { 'mm/s': { factor: 1 / 25.4, label: 'in/s' } },
  impulse: { 'N·s': { factor: 1 / 4.4482216, label: 'lbf·s' } },
  rfd: { 'N/s': { factor: 1 / 4.4482216, label: 'lbf/s' } },
  stiffness: { 'N/m': { factor: 0.0057101471, label: 'lbf/in' } },
  area: { 'mm²': { factor: 1 / 645.16, label: 'in²' } },
  powerRel: { 'W/kg': { factor: 1 / 2.2046226, label: 'W/lb' } },
};

export function unitRule(def: Pick<MetricDefinition, 'quantity' | 'unit'>, system: UnitSystem): UnitRule {
  if (system === 'imperial') {
    const r = IMPERIAL[def.quantity]?.[def.unit];
    if (r) return r;
  }
  return { factor: 1, label: def.unit };
}

export function convertMetric(
  def: Pick<MetricDefinition, 'quantity' | 'unit'>,
  value: number,
  system: UnitSystem,
): number {
  return value * unitRule(def, system).factor;
}

export function unitLabel(def: Pick<MetricDefinition, 'quantity' | 'unit'>, system: UnitSystem): string {
  return unitRule(def, system).label;
}

export interface FormatOptions {
  system?: UnitSystem;
  /** Dezimalkomma (de) statt Punkt (en) */
  locale?: 'de' | 'en';
  withUnit?: boolean;
}

/** Zahl mit Dezimalstellen nach Sprache, Ausnahme: „−“ bleibt ein Minuszeichen. */
export function formatNumber(v: number, decimals: number, locale: 'de' | 'en' = 'de'): string {
  const s = v.toFixed(decimals);
  return locale === 'de' ? s.replace('.', ',') : s;
}

/** Formatiert einen Metrikwert inkl. Umrechnung/Einheit. Asymmetrien: „R 5,2 %“ / „L 5,2 %“ (Seite des höheren Wertes). */
export function formatMetricValue(
  def: MetricDefinition,
  value: number | null | undefined,
  o: FormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  const locale = o.locale ?? 'de';
  if (def.kind === 'asymmetry') {
    const side = value > 0 ? 'R' : value < 0 ? 'L' : '';
    return `${side}${side ? ' ' : ''}${formatNumber(Math.abs(value), def.decimals, locale)} %`;
  }
  const sys = o.system ?? 'metric';
  const r = unitRule(def, sys);
  const dec = r.factor !== 1 && def.decimals === 0 ? 1 : def.decimals;
  const txt = formatNumber(value * r.factor, dec, locale);
  return o.withUnit === false || !r.label ? txt : `${txt} ${r.label}`;
}

/** Eingabewerte (Körpergröße/-gewicht) für die Anzeige: Länge in cm, Masse in kg. */
export const cmToDisplay = (cm: number, s: UnitSystem): number => (s === 'imperial' ? cm / 2.54 : cm);
export const displayToCm = (v: number, s: UnitSystem): number => (s === 'imperial' ? v * 2.54 : v);
export const kgToDisplay = (kg: number, s: UnitSystem): number => (s === 'imperial' ? kg * 2.2046226 : kg);
export const displayToKg = (v: number, s: UnitSystem): number => (s === 'imperial' ? v / 2.2046226 : v);
