import { describe, expect, it } from 'vitest';
import { G, analyzeRecording, metricsForFamily, type ForceTrace } from '../src/index.ts';

/**
 * Einheitentests der Metriken an einem Stufenprofil mit geschlossener Lösung (konstante Beschleunigungen):
 * m = 80 kg · Entlastung a = −2 m/s² (0,30 s) → Bremsen a = +5 (0,12 s, v → 0) → konzentrisch a = +8 (0,25 s) → v_TO = 2,0 m/s.
 * Stufen werden bei 1 kHz abgetastet ⇒ Toleranzen von 1–2 Samples/Halb-Sample-Integrationsfehlern.
 */
const HZ = 1000;
const M = 80;
const BW = M * G;

function stepTrace(shareL = 0.45): ForceTrace {
  const F: number[] = [];
  const push = (f: number, sec: number) => {
    for (let i = 0; i < Math.round(sec * HZ); i++) F.push(f);
  };
  push(BW, 1.5);
  push(M * (G - 2), 0.3);
  push(M * (G + 5), 0.12);
  push(M * (G + 8), 0.25);
  push(0, 0.408);
  push(BW + 1600, 0.1);
  push(BW, 1.5);
  const left = Float32Array.from(F, (f) => f * shareL);
  const right = Float32Array.from(F, (f) => f * (1 - shareL));
  return { hz: HZ, left, right };
}

describe('Metrikformeln (Stufenprofil, geschlossene Lösung)', () => {
  const res = analyzeRecording(stepTrace(), { bodyMassKg: M, mode: 'cmj' });
  const rep = res.reps[0]!;
  const m = rep.metrics;

  it('liefert genau eine CMJ-Rep', () => {
    expect(res.reps).toHaveLength(1);
    expect(rep.type).toBe('cmj');
    expect(rep.events['onset']).toBeGreaterThan(1495);
    expect(rep.events['onset']).toBeLessThan(1502);
  });

  it('Zeiten: Kontraktion 0,67 s · exz. 0,42 s · Entlastung 0,30 s · Bremsung 0,12 s · konzentrisch 0,25 s', () => {
    expect(m['contraction_time']!).toBeCloseTo(0.67, 2);
    expect(m['eccentric_duration']!).toBeCloseTo(0.42, 2);
    expect(m['unweighting_duration']!).toBeCloseTo(0.3, 2);
    expect(m['eccentric_decel_duration']!).toBeCloseTo(0.12, 2);
    expect(m['concentric_duration']!).toBeCloseTo(0.25, 2);
    expect(m['flight_time']!).toBeGreaterThan(0.405);
    expect(m['flight_time']!).toBeLessThan(0.41);
  });

  it('Sprunghöhe: Imp-Mom = v²/2g (v_TO = 2,0 m/s ⇒ 20,39 cm), Flugzeit-Höhe, Abhebegeschwindigkeit, RSI-mod', () => {
    expect(m['takeoff_velocity']!).toBeCloseTo(2.0, 1);
    expect(Math.abs(m['jump_height_impmom']! - 20.39)).toBeLessThan(0.5);
    expect(Math.abs(m['jump_height_flight']! - 20.39)).toBeLessThan(0.6);
    expect(m['rsi_modified']!).toBeCloseTo(0.2039 / 0.67, 1);
    expect(m['jump_height_impdis']!).toBeGreaterThan(m['jump_height_impmom']! - 0.01);
  });

  it('Gegenbewegung: Tiefe −12,6 cm · v_min = −0,6 m/s · Bremsimpuls m·0,6 = 48 N·s', () => {
    expect(Math.abs(m['countermovement_depth']! + 12.6)).toBeLessThan(0.5);
    expect(m['eccentric_peak_velocity']!).toBeCloseTo(-0.6, 1);
    expect(Math.abs(m['eccentric_decel_impulse']! - 48)).toBeLessThan(1.5);
  });

  it('Kräfte: exz. Spitzenkraft m(g+5), konz. Kraft m(g+8), exz. Mittelkraft ≈ BW (Netto-Impuls 0)', () => {
    expect(Math.abs(m['eccentric_peak_force']! - M * (G + 5))).toBeLessThan(2);
    expect(Math.abs(m['concentric_peak_force']! - M * (G + 8))).toBeLessThan(2);
    expect(Math.abs(m['takeoff_peak_force']! - M * (G + 8))).toBeLessThan(2);
    expect(Math.abs(m['concentric_mean_force']! - M * (G + 8))).toBeLessThan(20);
    expect(Math.abs(m['eccentric_mean_force']! - BW)).toBeLessThan(12);
    expect(m['force_at_zero_velocity']!).toBeGreaterThan(M * (G + 5) - 5);
    expect(m['force_at_zero_velocity']!).toBeLessThan(M * (G + 8) + 5);
  });

  it('Impulse: konzentrisch m·v_TO = 160 N·s, rel. = 2,0 m/s, erste 100 ms = m·8·0,1 = 64 N·s', () => {
    expect(Math.abs(m['concentric_impulse']! - 160)).toBeLessThan(3);
    expect(m['concentric_impulse_rel']!).toBeCloseTo(2.0, 1);
    expect(Math.abs(m['concentric_impulse_100ms']! - 64)).toBeLessThan(2);
  });

  it('Leistung: P_max = F·v_TO ≈ 2849 W, P_mittel ≈ F·v̄ = 1425 W, rel. = P/80 kg', () => {
    expect(Math.abs(m['peak_power']! - M * (G + 8) * 2)).toBeLessThan(70);
    expect(Math.abs(m['concentric_mean_power']! - M * (G + 8) * 1)).toBeLessThan(60);
    expect(m['peak_power_rel']!).toBeCloseTo(m['peak_power']! / M, 6);
    expect(m['concentric_peak_velocity']!).toBeCloseTo(2.0, 1);
  });

  it('RFD-Metriken sind endlich und nichtnegativ; Max-RFD innerhalb der konzentrischen Phase ≤ Stufenhöhe/50 ms', () => {
    for (const k of ['braking_rfd', 'eccentric_decel_rfd', 'concentric_rfd_max']) {
      expect(Number.isFinite(m[k]!), k).toBe(true);
      expect(m[k]!, k).toBeGreaterThanOrEqual(-1);
    }
    expect(m['concentric_rfd_max']!).toBeLessThanOrEqual((M * 3) / 0.05 + 1);
  });

  it('Landung: Spitzenkraft BW + 1600 N, Landungs-RFD positiv', () => {
    expect(Math.abs(m['peak_landing_force']! - (BW + 1600))).toBeLessThan(2);
    expect(m['landing_rfd']!).toBeGreaterThan(1000);
  });

  it('Körpergewicht-Metrik = m·g', () => {
    expect(m['body_weight']!).toBeCloseTo(BW, 6);
  });

  it('Asymmetrie: links 45 % / rechts 55 % ⇒ +18,18 % in allen Phasenmetriken', () => {
    for (const k of [
      'asym_concentric_mean_force',
      'asym_eccentric_mean_force',
      'asym_takeoff_peak_force',
      'asym_peak_landing_force',
    ])
      expect(m[k]!, k).toBeCloseTo(18.18, 1);
    expect(m['asym_concentric_impulse']!).toBeCloseTo(18.18, 0);
  });

  it('keine Metrik der CMJ-Familie bleibt null', () => {
    const missing = metricsForFamily('cmj')
      .map((d) => d.key)
      .filter((k) => m[k] === null || m[k] === undefined);
    // concentric_rfd ist per Definition leer, wenn die Kraft am Phasenanfang maximal ist (Stufenprofil)
    expect(missing).toEqual(['concentric_rfd']);
  });
});

describe('Metrikformeln SJ (ohne Gegenbewegung)', () => {
  const F: number[] = [];
  const push = (f: number, s: number) => {
    for (let i = 0; i < Math.round(s * HZ); i++) F.push(f);
  };
  push(BW, 1.5);
  push(M * (G + 6), 0.4); // v_TO = 2,4 m/s
  push(0, 0.489);
  push(BW + 1920, 0.1);
  push(BW, 1.5);
  const trace: ForceTrace = {
    hz: HZ,
    left: Float32Array.from(F, (f) => f / 2),
    right: Float32Array.from(F, (f) => f / 2),
  };
  const rep = analyzeRecording(trace, { bodyMassKg: M, mode: 'sj' }).reps[0]!;
  it('v_TO = 2,4 m/s ⇒ 29,4 cm; Kontraktion = konzentrisch = 0,40 s; Impuls m·a·t = 192 N·s', () => {
    expect(Math.abs(rep.metrics['jump_height_impmom']! - 29.36)).toBeLessThan(0.5);
    expect(rep.metrics['contraction_time']!).toBeCloseTo(0.4, 2);
    expect(rep.metrics['concentric_duration']!).toBeCloseTo(0.4, 2);
    expect(Math.abs(rep.metrics['concentric_impulse']! - 192)).toBeLessThan(3);
    expect(rep.metrics['asym_concentric_mean_force']!).toBeCloseTo(0, 6);
    const missing = metricsForFamily('sj')
      .filter((d) => rep.metrics[d.key] == null)
      .map((d) => d.key);
    expect(missing).toEqual(['concentric_rfd']);
  });
});
