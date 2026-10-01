import { describe, expect, it } from 'vitest';
import {
  analyzeRecording,
  cmrjTrial,
  createRng,
  djTrial,
  emptyProfile,
  failedAttempt,
  hopTrial,
  jumpTrial,
  landHoldTrial,
  renderScript,
  standProfile,
  stepOffProfile,
  stepOnLeadIn,
  withRest,
  type Profile,
  type RenderedScript,
  type RepResult,
} from '../src/index.ts';

/**
 * Genauigkeit gegen synthetische Signale mit bekannter Wahrheit (aus Physik simuliert, siehe synth/).
 * Ziele: Sprunghöhe ±0,5 cm, Ereigniszeiten ±2 ms (1000 Hz; Sensorrauschen 1 N SD je Platte + Sway + Rocking).
 * Onset-abhängige Zeiten (Kontraktionszeit, exzentrische Dauer) hängen vom Rauschen bei der 20-N-Schwelle ab: ±5 ms.
 */
const seg = (r: RenderedScript, kind: string, nth = 0) => r.segments.filter((s) => s.kind === kind)[nth]!;
const maxAbs = (a: number[]): number => Math.max(...a.map(Math.abs));

function analyzeScript(profiles: Profile[], hz: number, mass: number, seed: number, athlete = {}, an = {}) {
  const rend = renderScript(profiles, { hz, seed, athlete: { bodyMass: mass, ...athlete } });
  return { rend, res: analyzeRecording(rend.trace, { bodyMassKg: mass, ...an }) };
}

describe('CMJ – Monte-Carlo gegen Wahrheit', () => {
  for (const hz of [1000, 500]) {
    it(`${hz} Hz: 60 zufällige Athleten (Masse 55–110 kg, 18–60 cm, Tempo/Entlastung/Asymmetrie variiert)`, () => {
      const e = {
        jh: [] as number[],
        ft: [] as number[],
        ct: [] as number[],
        zv: [] as number[],
        to: [] as number[],
        depth: [] as number[],
        ecc: [] as number[],
      };
      for (let seed = 1; seed <= 60; seed++) {
        const r = createRng(seed * 7919 + hz);
        const mass = r.range(55, 110);
        const trial = jumpTrial({
          mass,
          jumpHeight: r.range(0.18, 0.6),
          unweight: r.range(0.35, 0.7),
          tempo: r.range(0.8, 1.25),
        });
        const { rend, res } = analyzeScript(withRest({ mass }, trial), hz, mass, seed, {
          asymmetry: r.range(-0.1, 0.1),
        });
        expect(res.reps).toHaveLength(1);
        const rep = res.reps[0]!;
        expect(rep.type).toBe('cmj');
        const s = seg(rend, 'pushoff');
        const m = rep.metrics;
        const trueOnset = s.events['onset20']! - 1 / hz;
        e.jh.push(m['jump_height_impmom']! - s.truth['jumpHeight']! * 100);
        e.ft.push((m['flight_time']! - s.truth['flightTime']!) * 1000);
        e.ct.push((m['contraction_time']! - (s.events['takeoff20']! - trueOnset)) * 1000);
        e.ecc.push((m['eccentric_duration']! - (s.events['zeroVel']! - trueOnset)) * 1000);
        e.zv.push((rep.events['zeroVel']! / hz - s.events['zeroVel']!) * 1000);
        e.to.push((rep.events['takeoff']! / hz - s.events['takeoff20']!) * 1000);
        e.depth.push(m['countermovement_depth']! + s.truth['depth']! * 100);
      }
      const tolT = hz === 1000 ? 2 : 4; // Ereigniszeiten
      expect(maxAbs(e.jh), 'Sprunghöhe cm').toBeLessThanOrEqual(0.5);
      expect(maxAbs(e.ft), 'Flugzeit ms').toBeLessThanOrEqual(tolT);
      expect(maxAbs(e.to), 'Takeoff ms').toBeLessThanOrEqual(hz === 1000 ? 1.01 : 2.01);
      expect(maxAbs(e.zv), 'v=0 ms').toBeLessThanOrEqual(tolT);
      expect(maxAbs(e.ct), 'Kontraktionszeit ms').toBeLessThanOrEqual(hz === 1000 ? 5 : 8);
      expect(maxAbs(e.ecc), 'exz. Dauer ms').toBeLessThanOrEqual(hz === 1000 ? 5 : 8);
      expect(maxAbs(e.depth), 'Tiefe cm').toBeLessThanOrEqual(0.5);
      // Bias klein
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
      expect(Math.abs(mean(e.jh))).toBeLessThan(0.15);
    });
  }

  it('Korrektur der Abhebegeschwindigkeit aus: Bias wird positiv (Referenz-App-Verhalten, ≈ +0,3 cm)', () => {
    const mass = 80;
    const { rend, res } = analyzeScript(
      withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.4 })),
      1000,
      mass,
      3,
      {},
      { config: { kinematics: { takeoffCorrection: false } } },
    );
    const err = res.reps[0]!.metrics['jump_height_impmom']! - seg(rend, 'pushoff').truth['jumpHeight']! * 100;
    expect(err).toBeGreaterThan(0.15);
    expect(err).toBeLessThan(0.5);
  });
});

describe('weitere Abdruck-Sprünge', () => {
  it('SJ (ohne Gegenbewegung): erkannt als sj, Sprunghöhe ±0,5 cm, keine exzentrischen Metriken', () => {
    const mass = 74;
    const { rend, res } = analyzeScript(
      withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.33, kind: 'sj' })),
      1000,
      mass,
      11,
    );
    const rep = res.reps[0]!;
    expect(rep.type).toBe('sj');
    expect(rep.confidence).toBeGreaterThan(0.9);
    expect(Math.abs(rep.metrics['jump_height_impmom']! - 33)).toBeLessThan(0.5);
    expect(rep.metrics['eccentric_duration']).toBeUndefined();
    expect(rep.metrics['concentric_duration']!).toBeCloseTo(rep.metrics['contraction_time']!, 3);
    expect(seg(rend, 'pushoff').truth['jumpHeight']).toBeCloseTo(0.33, 3);
  });

  it('Loaded CMJ (20 kg): Typ loaded_cmj, Kinematik mit Systemmasse, Sprunghöhe ±0,5 cm', () => {
    const mass = 82;
    const { rend, res } = analyzeScript(
      withRest({ mass, loadKg: 20 }, jumpTrial({ mass, loadKg: 20, jumpHeight: 0.24 })),
      1000,
      mass,
      12,
      {},
      { externalLoadKg: 20 },
    );
    const rep = res.reps[0]!;
    expect(rep.type).toBe('loaded_cmj');
    expect(
      Math.abs(rep.metrics['jump_height_impmom']! - seg(rend, 'pushoff').truth['jumpHeight']! * 100),
    ).toBeLessThan(0.5);
    expect(rep.metrics['body_weight']!).toBeCloseTo(102 * 9.80665, 3);
  });

  it('Einbeinig (links): sl_jump, Seite links, keine Asymmetrie-Metriken', () => {
    const mass = 80;
    const { rend, res } = analyzeScript(
      withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.2 })),
      1000,
      mass,
      13,
      { singleLeg: 'left' },
    );
    const rep = res.reps[0]!;
    expect(rep.type).toBe('sl_jump');
    expect(rep.side).toBe('left');
    expect(rep.metrics['asym_concentric_mean_force']).toBeNull();
    expect(
      Math.abs(rep.metrics['jump_height_impmom']! - seg(rend, 'pushoff').truth['jumpHeight']! * 100),
    ).toBeLessThan(0.5);
  });

  it('Asymmetrie-Konvention: rechts 55 % / links 45 % ⇒ +18,2 % (rechts höher), links 55 % ⇒ −18,2 %', () => {
    const mass = 80;
    for (const [asym, expected] of [
      [0.1, 18.18],
      [-0.1, -18.18],
      [0, 0],
    ] as const) {
      const { res } = analyzeScript(
        withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.3 })),
        1000,
        mass,
        14,
        { asymmetry: asym, rockingFrac: 0 },
      );
      const m = res.reps[0]!.metrics;
      expect(m['asym_concentric_mean_force']!).toBeCloseTo(expected, 0);
      expect(m['asym_takeoff_peak_force']!).toBeCloseTo(expected, 0);
      expect(m['asym_concentric_impulse']!).toBeCloseTo(expected, 0);
      expect(m['asym_eccentric_mean_force']!).toBeCloseTo(expected, 0);
      expect(m['asym_peak_landing_force']!).toBeCloseTo(expected, 0);
    }
  });
});

describe('CMRJ, Hop, DJ, Land & Hold', () => {
  it('CMRJ: Rebound-Sprunghöhe ±0,5 cm, Rebound-Kontaktzeit ±2 ms, Rebound-RSI', () => {
    const mass = 78;
    const { rend, res } = analyzeScript(
      withRest({ mass }, cmrjTrial({ mass, jumpHeight: 0.37, reboundHeight: 0.29, contact: 0.24 })),
      1000,
      mass,
      21,
    );
    expect(res.reps).toHaveLength(1);
    const rep = res.reps[0]!;
    expect(rep.type).toBe('cmrj');
    const m = rep.metrics;
    expect(Math.abs(m['jump_height_impmom']! - seg(rend, 'pushoff').truth['jumpHeight']! * 100)).toBeLessThan(
      0.5,
    );
    expect(Math.abs(m['rebound_jump_height']! - 29)).toBeLessThan(0.5);
    expect(Math.abs(m['rebound_contact_time']! - 0.24)).toBeLessThan(0.002);
    expect(Math.abs(m['rebound_rsi']! - 0.29 / 0.24)).toBeLessThan(0.02);
    // Landungsfenster endet am Rebound-Abheben
    expect(rep.events['landingEnd']!).toBeLessThanOrEqual(rep.events['reboundTakeoff']! + 1e-6);
  });

  it('Hop-Test: 9 Hops → 9 Reps, erster Kontakt Lead-in, beste 5 nach RSI eingeschlossen, Zeiten ±2 ms', () => {
    const mass = 70;
    const heights = [0.09, 0.14, 0.15, 0.17, 0.16, 0.12, 0.18, 0.15, 0.13];
    const { rend, res } = analyzeScript(
      withRest({ mass }, hopTrial({ mass, heights, contact: 0.18 })),
      1000,
      mass,
      22,
    );
    expect(res.reps).toHaveLength(9);
    expect(res.reps.every((r) => r.type === 'hop')).toBe(true);
    expect(res.reps[0]!.leadIn).toBe(true);
    expect(res.reps[0]!.included).toBe(false);
    const included = res.reps.filter((r) => r.included);
    expect(included).toHaveLength(5);
    const rsi = (r: RepResult) => r.metrics['rsi']!;
    const worstIncluded = Math.min(...included.map(rsi));
    for (const r of res.reps.filter((x) => !x.included && !x.leadIn))
      expect(rsi(r)).toBeLessThanOrEqual(worstIncluded);
    heights.slice(1).forEach((h, i) => {
      const r = res.reps[i + 1]!;
      expect(Math.abs(r.metrics['contact_time']! - 0.18), `Kontakt ${i + 1}`).toBeLessThan(0.002);
      expect(Math.abs(r.metrics['jump_height_flight']! - h * 100), `JH ${i + 1}`).toBeLessThan(0.5);
    });
    const b1 = seg(rend, 'bounce', 0);
    expect(b1.truth['contactTime']).toBeCloseTo(0.18, 6);
  });

  it('DJ: Kontaktzeit ±2 ms, Flug-Sprunghöhe ±0,5 cm, RSI, geschätzte Fallhöhe ±2 cm, Spitzenkraft ±1 %', () => {
    const mass = 84;
    const { rend, res } = analyzeScript(
      [
        emptyProfile(2.5),
        ...djTrial({ mass, dropHeight: 0.4, jumpHeight: 0.32, contact: 0.21 }),
        standProfile(mass, 2.5),
      ],
      1000,
      mass,
      23,
    );
    expect(res.reps).toHaveLength(1);
    const rep = res.reps[0]!;
    expect(rep.type).toBe('dj');
    const m = rep.metrics;
    const b = seg(rend, 'bounce');
    expect(Math.abs(m['contact_time']! - 0.21)).toBeLessThan(0.002);
    expect(Math.abs(m['jump_height_flight']! - 32)).toBeLessThan(0.5);
    expect(Math.abs(m['rsi']! - 0.32 / 0.21)).toBeLessThan(0.03);
    expect(Math.abs(m['drop_height_est']! - 40)).toBeLessThan(2);
    expect(
      Math.abs(m['peak_drop_landing_force']! - b.truth['peakForceN']!) / b.truth['peakForceN']!,
    ).toBeLessThan(0.01);
    expect(m['active_stiffness']!).toBeGreaterThan(10000);
  });

  it('Land & Hold: Drop-Landung ohne Folgeflug, Fallhöhe ±2 cm, Stabilisierung gefunden', () => {
    const mass = 77;
    const { rend, res } = analyzeScript(
      [emptyProfile(2.5), ...landHoldTrial({ mass, dropHeight: 0.35 }), standProfile(mass, 3)],
      1000,
      mass,
      24,
    );
    expect(res.reps).toHaveLength(1);
    const rep = res.reps[0]!;
    expect(rep.type).toBe('land_hold');
    expect(Math.abs(rep.metrics['drop_height_est']! - 35)).toBeLessThan(2);
    expect(
      Math.abs(rep.metrics['peak_landing_force']! - seg(rend, 'catch').truth['peakForceN']!),
    ).toBeLessThan(5);
    expect(rep.metrics['time_to_stabilization']!).toBeGreaterThan(0.2);
    expect(rep.metrics['time_to_stabilization']!).toBeLessThan(1.2);
  });
});

describe('Aufnahme mit mehreren Versuchen', () => {
  const mass = 80;
  const build = (): Profile[] => [
    ...stepOnLeadIn({ mass }),
    ...jumpTrial({ mass, jumpHeight: 0.3 }),
    standProfile(mass, 3),
    ...failedAttempt({ mass }),
    standProfile(mass, 3),
    ...jumpTrial({ mass, jumpHeight: 0.34, kind: 'sj' }),
    standProfile(mass, 3),
    ...cmrjTrial({ mass, jumpHeight: 0.35, reboundHeight: 0.28 }),
    standProfile(mass, 3),
    ...jumpTrial({ mass, jumpHeight: 0.31 }),
    standProfile(mass, 2),
    stepOffProfile(mass),
    emptyProfile(1.5),
  ];

  it('Auto-Detect trennt Typen in Reihenfolge, meldet Fehlversuch, ignoriert Auf-/Abtreten', () => {
    const { rend, res } = analyzeScript(build(), 1000, mass, 31);
    expect(res.reps.map((r) => r.type)).toEqual(['cmj', 'sj', 'cmrj', 'cmj']);
    expect(res.warnings.filter((w) => w.code === 'failed_attempt')).toHaveLength(1);
    expect(res.reps.every((r) => r.confidence! > 0.9)).toBe(true);
    const po = rend.segments.filter((s) => s.kind === 'pushoff');
    res.reps.forEach((r, i) =>
      expect(Math.abs(r.metrics['jump_height_impmom']! - po[i]!.truth['jumpHeight']! * 100)).toBeLessThan(
        0.5,
      ),
    );
  });

  it('feste Typvorgabe (cmj) analysiert jede Bewegung als CMJ; Aufnahme bei 500 Hz funktioniert ebenfalls', () => {
    const forced = analyzeScript(build(), 500, mass, 32, {}, { mode: 'cmj' }).res;
    expect(forced.reps.map((r) => r.type)).toEqual(['cmj', 'cmj', 'cmj', 'cmj']);
    expect(forced.reps.every((r) => r.detectedType === null)).toBe(true);
    const auto500 = analyzeScript(build(), 500, mass, 33).res;
    expect(auto500.reps.map((r) => r.type)).toEqual(['cmj', 'sj', 'cmrj', 'cmj']);
  });

  it('Manueller Trial-Bereich: nur der markierte Abschnitt wird analysiert', () => {
    const { rend, res } = analyzeScript(build(), 1000, mass, 34);
    const sjStart = res.reps[1]!.startIdx;
    const sjEnd = res.reps[1]!.endIdx;
    const ranged = analyzeRecording(rend.trace, {
      bodyMassKg: mass,
      mode: 'sj',
      range: { start: sjStart, end: sjEnd },
    });
    expect(ranged.reps).toHaveLength(1);
    expect(ranged.reps[0]!.type).toBe('sj');
    expect(ranged.reps[0]!.metrics['jump_height_impmom']).toBeCloseTo(
      res.reps[1]!.metrics['jump_height_impmom']!,
      6,
    );
  });

  it('Gewicht aus der Ruhephase schätzen („Wiegen überspringen“), Warnung weight_estimated', () => {
    const rend = renderScript(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.3 })), {
      hz: 1000,
      seed: 35,
    });
    const res = analyzeRecording(rend.trace, { mode: 'cmj' });
    expect(res.massSource).toBe('quiet');
    expect(Math.abs(res.bodyMassKg! - mass)).toBeLessThan(0.6);
    expect(res.warnings.some((w) => w.code === 'weight_estimated')).toBe(true);
    expect(Math.abs(res.reps[0]!.metrics['jump_height_impmom']! - 30)).toBeLessThan(0.7);
  });

  it('Pause/Re-Zero (breaks) trennt Segmente: keine Integration über die Unterbrechung', () => {
    const a = renderScript(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.3 })), { hz: 1000, seed: 36 });
    const b = renderScript(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.35 })), { hz: 1000, seed: 37 });
    const left = Float32Array.from([...a.trace.left, ...b.trace.left]);
    const right = Float32Array.from([...a.trace.right, ...b.trace.right]);
    const res = analyzeRecording(
      { hz: 1000, left, right, breaks: [a.trace.left.length] },
      { bodyMassKg: mass },
    );
    expect(res.reps.map((r) => r.type)).toEqual(['cmj', 'cmj']);
    expect(res.reps[1]!.startIdx).toBeGreaterThanOrEqual(a.trace.left.length);
  });

  it('deterministisch: gleicher Seed ⇒ identisches Ergebnis', () => {
    const r1 = analyzeScript(build(), 1000, mass, 40).res;
    const r2 = analyzeScript(build(), 1000, mass, 40).res;
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
