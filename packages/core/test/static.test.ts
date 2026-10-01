import { describe, expect, it } from 'vitest';
import {
  ISO_PRESETS,
  analyzeRecording,
  balanceProfile,
  convexHullArea,
  copFromCorners,
  createRng,
  ellipseArea95,
  isoPresetFor,
  isometricProfile,
  lowpassZeroPhase,
  pathLength,
  renderScript,
  standProfile,
  G,
  type TestType,
} from '../src/index.ts';

const seg = (r: ReturnType<typeof renderScript>, kind: string) => r.segments.find((s) => s.kind === kind)!;

describe('Isometrie (Yank-Onset, RFD, Impuls) gegen Wahrheit', () => {
  const mass = 85;
  const bw = mass * G;
  const run = (
    peakNet: number,
    rise: number,
    hz: number,
    seed: number,
    opts: { mode?: TestType; weigh?: boolean } = {},
  ) => {
    const prof = [
      standProfile(mass, 1.5),
      isometricProfile({ baselineN: bw, peakNetN: peakNet, rise, hold: 2.5, lead: 0.5 }),
    ];
    const r = renderScript(prof, { hz, seed, athlete: { bodyMass: mass } });
    const res = analyzeRecording(r.trace, {
      mode: opts.mode ?? 'isometric',
      bodyMassKg: opts.weigh === false ? undefined : mass,
    });
    return { r, res, truth: seg(r, 'isometric') };
  };

  it('IMTP-artig (2000 N netto, 0,9 s Anstieg): Spitze ±0,5 %, Zeit bis Spitze ±30 ms, RFD/Impuls ±15 %', () => {
    const { res, truth } = run(2000, 0.9, 1000, 1, { mode: 'imtp' });
    expect(res.reps).toHaveLength(1);
    const m = res.reps[0]!.metrics;
    expect(
      Math.abs(m['iso_peak_force']! - truth.truth['peakForceN']!) / truth.truth['peakForceN']!,
    ).toBeLessThan(0.005);
    expect(Math.abs(m['iso_net_peak_force']! - 2000)).toBeLessThan(15);
    expect(Math.abs(m['iso_time_to_peak']! - 0.9)).toBeLessThan(0.03);
    // Onset: Yank-Methode, Abweichung zur Wahrheit (Kontraktionsbeginn bei t = lead) wenige ms
    const onsetErr = (res.reps[0]!.events['onset']! / 1000 - truth.events['onset']!) * 1000;
    expect(Math.abs(onsetErr)).toBeLessThan(25);
    for (const w of [100, 200, 250])
      expect(Math.abs(m[`iso_rfd_${w}`]! - truth.truth[`rfd${w}`]!) / truth.truth[`rfd${w}`]!).toBeLessThan(
        0.15,
      );
    for (const w of [100, 200, 300])
      expect(
        Math.abs(m[`iso_impulse_${w}ms`]! - truth.truth[`impulse${w}`]!) / truth.truth[`impulse${w}`]!,
      ).toBeLessThan(0.2);
  });

  it('Yank-Schwelle hängt vom Peak ab: kleiner Peak (< 250 N netto) nutzt 40 N/s', () => {
    const { res, truth } = run(150, 1.5, 1000, 2, { mode: 'shoulder_iso_y' });
    expect(res.reps).toHaveLength(1);
    const m = res.reps[0]!.metrics;
    expect(Math.abs(m['iso_net_peak_force']! - 150)).toBeLessThan(10);
    expect(Math.abs(m['iso_time_to_peak']! - 1.5)).toBeLessThan(0.15);
    const onsetErr = (res.reps[0]!.events['onset']! / 1000 - truth.events['onset']!) * 1000;
    expect(Math.abs(onsetErr)).toBeLessThan(80);
  });

  it('5-SD-Methode ist umschaltbar und liefert vergleichbare Werte', () => {
    const prof = [
      standProfile(mass, 1.5),
      isometricProfile({ baselineN: bw, peakNetN: 1500, rise: 0.8, hold: 2, lead: 0.5 }),
    ];
    const r = renderScript(prof, { hz: 1000, seed: 3, athlete: { bodyMass: mass } });
    const sd5 = analyzeRecording(r.trace, {
      mode: 'isometric',
      bodyMassKg: mass,
      config: { isoOnset: { method: 'sd5' } },
    });
    const yank = analyzeRecording(r.trace, { mode: 'isometric', bodyMassKg: mass });
    expect(sd5.reps).toHaveLength(1);
    expect(
      Math.abs(sd5.reps[0]!.metrics['iso_net_peak_force']! - yank.reps[0]!.metrics['iso_net_peak_force']!),
    ).toBeLessThan(1);
    expect(Math.abs(sd5.reps[0]!.events['onset']! - yank.reps[0]!.events['onset']!)).toBeLessThan(40);
    expect(sd5.reps[0]!.events['onset']!).toBeLessThanOrEqual(yank.reps[0]!.events['onset']! + 1); // 5-SD ist empfindlicher
  });

  it('ohne Wiegen: Basislinie aus der Ruhe; Netto-Spitze ≈ Peak − Ruhekraft', () => {
    const { res } = run(1800, 0.8, 1000, 4, { weigh: false });
    expect(Math.abs(res.reps[0]!.metrics['iso_net_peak_force']! - 1800)).toBeLessThan(12);
    expect(res.massSource).toBe('none');
  });

  it('mehrere Kontraktionen → mehrere Reps; kein Signal → Warnung', () => {
    const one = isometricProfile({ baselineN: bw, peakNetN: 1600, rise: 0.7, hold: 1.2, lead: 0.3 });
    const r = renderScript(
      [standProfile(mass, 1.5), one, standProfile(mass, 2), one, standProfile(mass, 2), one],
      { hz: 1000, seed: 5, athlete: { bodyMass: mass } },
    );
    const res = analyzeRecording(r.trace, { mode: 'isometric', bodyMassKg: mass });
    expect(res.reps).toHaveLength(3);
    for (const rep of res.reps) expect(Math.abs(rep.metrics['iso_net_peak_force']! - 1600)).toBeLessThan(15);
    const flat = renderScript([standProfile(mass, 5)], { hz: 1000, seed: 6, athlete: { bodyMass: mass } });
    const none = analyzeRecording(flat.trace, { mode: 'isometric', bodyMassKg: mass });
    expect(none.reps).toHaveLength(0);
    expect(none.warnings.some((w) => w.code === 'no_contraction')).toBe(true);
  });

  it('invertierte Richtung (Kraft sinkt, z. B. Zug nach oben am entlastenden Gurt) wird erkannt und positiv ausgewertet', () => {
    const { res } = run(-300, 1.0, 1000, 7, { mode: 'isometric' });
    expect(res.reps).toHaveLength(1);
    expect(res.reps[0]!.warnings.some((w) => w.code === 'inverted_direction')).toBe(true);
    expect(res.reps[0]!.metrics['iso_net_peak_force']!).toBeGreaterThan(280);
  });

  it('L/R-Asymmetrie der Netto-Spitze: R 55 % / L 45 % ⇒ +18 %', () => {
    const prof = [
      standProfile(mass, 1.5),
      isometricProfile({ baselineN: bw, peakNetN: 1800, rise: 0.8, hold: 2, lead: 0.5 }),
    ];
    const r = renderScript(prof, {
      hz: 1000,
      seed: 8,
      athlete: { bodyMass: mass, asymmetry: 0.1, rockingFrac: 0 },
    });
    const res = analyzeRecording(r.trace, { mode: 'isometric', bodyMassKg: mass });
    expect(res.reps[0]!.metrics['asym_iso_peak_force']!).toBeGreaterThan(14);
    expect(res.reps[0]!.metrics['asym_iso_peak_force']!).toBeLessThan(22);
  });

  it('Presets: IMTP/Squat empfehlen Wiegen, Schulter-Tests haben niedrige Mindest-Kontraktion und Kacheln existieren in der Registry', async () => {
    const { getMetric } = await import('../src/index.ts');
    expect(isoPresetFor('imtp').weigh).toBe('recommended');
    expect(isoPresetFor('shoulder_iso_t').minContractionN).toBeLessThan(isoPresetFor('imtp').minContractionN);
    expect(isoPresetFor('cmj' as TestType)).toBe(ISO_PRESETS.isometric);
    for (const p of Object.values(ISO_PRESETS))
      for (const k of p!.tiles) expect(getMetric(k), k).toBeDefined();
  });
});

describe('Balance (CoP aus Eckensensoren, Pfad, Ellipse, ML/AP)', () => {
  const mass = 78;
  const geom = { widthMm: 400, lengthMm: 600, gapMm: 100 };
  const hz = 200;
  const mk = (
    kind: 'quiet' | 'sl',
    side: 'left' | 'right' | null,
    seed: number,
    sig: { ml: number; ap: number; tau?: number },
  ) => {
    const p = balanceProfile({
      mass,
      duration: 31,
      sigmaMl: sig.ml,
      sigmaAp: sig.ap,
      tau: sig.tau,
      centerX: side === 'left' ? -250 : side === 'right' ? 250 : 0,
      rng: createRng(seed),
    });
    const r = renderScript([p], {
      hz,
      seed,
      athlete: { bodyMass: mass, singleLeg: side, rockingFrac: 0 },
      geometry: geom,
    });
    const cop = copFromCorners(r.corners!, geom);
    const trace = { ...r.trace, copX: cop.x, copY: cop.y };
    const type: TestType = kind === 'quiet' ? 'quiet_stand' : 'sl_stand';
    return { r, trace, res: analyzeRecording(trace, { mode: type }), type };
  };

  it('copFromCorners: bekannte Lastverteilung → exakte Position', () => {
    // linke Platte: alle Last vorn rechts; rechte Platte leer
    const c = copFromCorners([0, 100, 0, 0, 0, 0, 0, 0], geom);
    expect(c.x[0]).toBeCloseTo(-250 + 200, 4);
    expect(c.y[0]).toBeCloseTo(300, 4);
    // gleichmäßig auf beide Platten
    const d = copFromCorners([25, 25, 25, 25, 25, 25, 25, 25], geom);
    expect(d.x[0]).toBeCloseTo(0, 6);
    expect(d.y[0]).toBeCloseTo(0, 6);
  });

  it('Quiet Stand 200 Hz, 31 s: Pfadlänge ±8 %, SD ML/AP ±20 %, Ellipse ±30 % gegen Wahrheit', () => {
    const { r, res } = mk('quiet', null, 11, { ml: 6, ap: 9 });
    expect(res.reps).toHaveLength(1);
    const m = res.reps[0]!.metrics;
    const cop = r.cleanCop!;
    const a0 = 200; // 1 s Einschwingen
    const x = Float64Array.from(cop.x.subarray(a0));
    const y = Float64Array.from(cop.y.subarray(a0));
    const xf = lowpassZeroPhase(x, hz, 10);
    const yf = lowpassZeroPhase(y, hz, 10);
    const truthPath = pathLength(xf, yf);
    expect(Math.abs(m['cop_path_length']! - truthPath) / truthPath).toBeLessThan(0.08);
    expect(Math.abs(m['cop_ml_sd']! - 6) / 6).toBeLessThan(0.2);
    expect(Math.abs(m['cop_ap_sd']! - 9) / 9).toBeLessThan(0.2);
    const truthArea = ellipseArea95(xf, yf);
    expect(Math.abs(m['cop_area_95']! - truthArea) / truthArea).toBeLessThan(0.3);
    expect(m['cop_mean_velocity']!).toBeCloseTo(m['cop_path_length']! / 30, 1);
    expect(m['balance_duration']!).toBeCloseTo(30, 1);
    expect(m['cop_hull_area']!).toBeGreaterThan(m['cop_area_95']! * 0.5);
    expect(m['cop_ap_range']!).toBeGreaterThan(m['cop_ap_sd']! * 2);
  });

  it('Einbeinstand: Seite erkannt, CoP relativ zum Fuß (Mittel ≈ 0), keine Asymmetrie-Metriken', () => {
    const { res, trace } = mk('sl', 'right', 12, { ml: 8, ap: 12 });
    const rep = res.reps[0]!;
    expect(rep.side).toBe('right');
    expect(rep.metrics['asym_balance_load']).toBeNull();
    expect(rep.metrics['cop_ml_sd']!).toBeGreaterThan(5);
    expect(rep.metrics['cop_ml_sd']!).toBeLessThan(11);
    // Rohe CoP-Spur liegt bei +250 mm (rechte Plattenmitte)
    const meanX = trace.copX!.reduce((a, b) => a + b, 0) / trace.copX!.length;
    expect(meanX).toBeGreaterThan(200);
  });

  it('größere Schwankung ⇒ größere Pfadlänge/Fläche (Augen zu / instabile Unterlage)', () => {
    const calm = mk('quiet', null, 13, { ml: 4, ap: 6 }).res.reps[0]!.metrics;
    const wob = mk('quiet', null, 13, { ml: 10, ap: 15 }).res.reps[0]!.metrics;
    expect(wob['cop_path_length']!).toBeGreaterThan(calm['cop_path_length']! * 1.8);
    expect(wob['cop_area_95']!).toBeGreaterThan(calm['cop_area_95']! * 3);
  });

  it('ohne Eckensensoren: nur ML aus den Plattenkräften, 2D-Metriken sind null, Warnung no_cop', () => {
    const { r } = mk('quiet', null, 14, { ml: 6, ap: 9 });
    const res = analyzeRecording(r.trace, { mode: 'quiet_stand' });
    const rep = res.reps[0]!;
    expect(rep.warnings.some((w) => w.code === 'no_cop')).toBe(true);
    expect(rep.metrics['cop_path_length']).toBeNull();
    expect(rep.metrics['cop_ap_sd']).toBeNull();
    expect(rep.metrics['cop_ml_sd']!).toBeGreaterThan(3);
  });

  it('Aufnahme kürzer als Einschwingzeit + 2 s ⇒ Fehler balance_too_short; 5 s ⇒ Warnung short_balance', () => {
    const p = balanceProfile({ mass, duration: 2.5, rng: createRng(1) });
    const r = renderScript([p], { hz, seed: 1, athlete: { bodyMass: mass }, geometry: geom });
    const res = analyzeRecording(
      { ...r.trace, copX: copFromCorners(r.corners!, geom).x, copY: copFromCorners(r.corners!, geom).y },
      { mode: 'quiet_stand' },
    );
    expect(res.reps).toHaveLength(0);
    expect(res.warnings.some((w) => w.code === 'balance_too_short')).toBe(true);
    const p5 = balanceProfile({ mass, duration: 6, rng: createRng(2) });
    const r5 = renderScript([p5], { hz, seed: 2, athlete: { bodyMass: mass }, geometry: geom });
    const c5 = copFromCorners(r5.corners!, geom);
    const res5 = analyzeRecording({ ...r5.trace, copX: c5.x, copY: c5.y }, { mode: 'quiet_stand' });
    expect(res5.reps[0]!.warnings.some((w) => w.code === 'short_balance')).toBe(true);
  });

  it('Hüllfläche eines Quadrats und Ellipsenfläche eines bekannten Gauß', () => {
    const x = Float64Array.from([0, 10, 10, 0, 5]);
    const y = Float64Array.from([0, 0, 10, 10, 5]);
    expect(convexHullArea(x, y)).toBeCloseTo(100, 6);
    const rng = createRng(5);
    const gx = Float64Array.from({ length: 20000 }, () => rng.normal() * 3);
    const gy = Float64Array.from({ length: 20000 }, () => rng.normal() * 5);
    expect(ellipseArea95(gx, gy) / (5.991 * Math.PI * 15)).toBeCloseTo(1, 1);
  });
});

describe('Tiefpass', () => {
  it('Zero-Phase: keine Phasenverschiebung, dämpft Rauschen oberhalb der Grenzfrequenz', () => {
    const hz = 200;
    const x = Float64Array.from(
      { length: 2000 },
      (_, i) => Math.sin((2 * Math.PI * 1 * i) / hz) + 0.5 * Math.sin((2 * Math.PI * 40 * i) / hz),
    );
    const y = lowpassZeroPhase(x, hz, 10);
    let err = 0;
    for (let i = 100; i < 1900; i++) err = Math.max(err, Math.abs(y[i]! - Math.sin((2 * Math.PI * i) / hz)));
    expect(err).toBeLessThan(0.02);
  });
});
