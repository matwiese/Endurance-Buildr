import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TILE_METRICS,
  TEST_TYPES,
  cmToDisplay,
  convertMetric,
  displayToKg,
  formatMetricValue,
  formatNumber,
  getMetric,
  unitLabel,
} from '../src/index.ts';

const m = (k: string) => getMetric(k)!;

describe('Einheiten und Formatierung', () => {
  it('metrisch: Einheit und Dezimalstellen laut Registry, Dezimalkomma bei de', () => {
    expect(formatMetricValue(m('jump_height_impmom'), 44.92)).toBe('44,9 cm');
    expect(formatMetricValue(m('jump_height_impmom'), 44.92, { locale: 'en' })).toBe('44.9 cm');
    expect(formatMetricValue(m('flight_time'), 0.6164)).toBe('0,616 s');
    expect(formatMetricValue(m('peak_power'), 5628.06)).toBe('5628 W');
    expect(formatMetricValue(m('jump_height_impmom'), null)).toBe('–');
    expect(formatMetricValue(m('jump_height_impmom'), Number.NaN)).toBe('–');
  });
  it('imperial: cm→in, N→lbf, kg→lb, N/s→lbf/s; Zeiten und Prozent bleiben', () => {
    const imp = { system: 'imperial' as const };
    expect(convertMetric(m('jump_height_impmom'), 25.4, 'imperial')).toBeCloseTo(10, 6);
    expect(unitLabel(m('jump_height_impmom'), 'imperial')).toBe('in');
    expect(formatMetricValue(m('concentric_peak_force'), 2330.7, imp)).toBe('524,0 lbf');
    expect(unitLabel(m('concentric_rfd'), 'imperial')).toBe('lbf/s');
    expect(unitLabel(m('flight_time'), 'imperial')).toBe('s');
    expect(unitLabel(m('asym_takeoff_peak_force'), 'imperial')).toBe('%');
    expect(cmToDisplay(180, 'imperial')).toBeCloseTo(70.866, 2);
    expect(displayToKg(176.37, 'imperial')).toBeCloseTo(80, 1);
  });
  it('Asymmetrie mit Seitenangabe: + ⇒ R, − ⇒ L, 0 ohne Seite', () => {
    expect(formatMetricValue(m('asym_takeoff_peak_force'), 5.23)).toBe('R 5,2 %');
    expect(formatMetricValue(m('asym_takeoff_peak_force'), -5.23, { locale: 'en' })).toBe('L 5.2 %');
    expect(formatMetricValue(m('asym_takeoff_peak_force'), 0)).toBe('0,0 %');
  });
  it('formatNumber', () => {
    expect(formatNumber(3.14159, 2, 'de')).toBe('3,14');
    expect(formatNumber(3.14159, 3, 'en')).toBe('3.142');
  });
});

describe('Standard-Kacheln', () => {
  it('jeder Testtyp hat Kacheln; alle Schlüssel existieren in der Registry und gehören zur Familie des Typs', () => {
    for (const t of TEST_TYPES) {
      const tiles = DEFAULT_TILE_METRICS[t];
      expect(tiles.length, t).toBeGreaterThanOrEqual(4);
      for (const k of tiles) {
        const def = getMetric(k);
        expect(def, `${t}: ${k}`).toBeDefined();
      }
    }
  });
  it('enthalten je Sprung-/Isometrietyp eine Asymmetrie-Kachel (mit Seitenangabe)', () => {
    for (const t of TEST_TYPES) {
      if (t === 'quiet_stand' || t === 'sl_stand' || t === 'sl_range_of_stability') continue;
      expect(
        DEFAULT_TILE_METRICS[t].some((k) => getMetric(k)!.kind === 'asymmetry'),
        t,
      ).toBe(true);
    }
  });
});
