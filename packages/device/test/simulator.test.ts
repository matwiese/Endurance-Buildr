import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  G,
  analyzeRecording,
  computeZero,
  copFromCorners,
  mergeConfig,
  parseForceTraceCsv,
  type ForceTrace,
  type TestType,
} from '@buildr/core';
import {
  FileReplayAdapter,
  JitterBuffer,
  SimulatorAdapter,
  type Sample,
  type SimTrialType,
} from '../src/index.ts';

/** Zeichnet alles auf, was ein Adapter liefert (Jitterbuffer → gleichmäßige Spur), mit Roh-Offsets. */
function recorder(hz: number) {
  const jb = new JitterBuffer({ hz });
  const L: number[] = [];
  const R: number[] = [];
  const breaks: number[] = [];
  const add = (c: ReturnType<JitterBuffer['push']>) => {
    for (const b of c.breaks) breaks.push(L.length + b);
    L.push(...c.left);
    R.push(...c.right);
  };
  return {
    jb,
    push: (s: readonly Sample[]) => add(jb.push(s)),
    finish: (): ForceTrace => {
      add(jb.flush());
      return { hz, left: Float32Array.from(L), right: Float32Array.from(R), breaks };
    },
  };
}

function zeroed(trace: ForceTrace, zeroSec: number): { trace: ForceTrace; offL: number; offR: number } {
  const n = Math.round(zeroSec * trace.hz);
  const z = computeZero(trace.left.subarray(0, n), trace.right.subarray(0, n), trace.hz, mergeConfig().zero);
  expect(z.ok).toBe(true);
  return {
    trace: {
      ...trace,
      left: trace.left.map((v) => v - z.offsetLeft),
      right: trace.right.map((v) => v - z.offsetRight),
    },
    offL: z.offsetLeft,
    offR: z.offsetRight,
  };
}

describe('SimulatorAdapter', () => {
  it('liefert Rohdaten mit Plattenoffsets (leere Platte ≈ Offset ± Rauschen) und Paketnummern', async () => {
    const sim = new SimulatorAdapter({ clock: 'manual', seed: 3, plateOffsets: { left: 14.2, right: -9.7 } });
    await sim.connect();
    const got: Sample[] = [];
    sim.onSample((b) => got.push(...b));
    sim.advance(2000);
    expect(got).toHaveLength(2000);
    expect(got[5]!.seq).toBe(5);
    expect(got[10]!.t - got[9]!.t).toBeCloseTo(1000, 6);
    const l = got.reduce((a, s) => a + s.left, 0) / got.length;
    const r = got.reduce((a, s) => a + s.right, 0) / got.length;
    expect(l).toBeCloseTo(14.2, 0);
    expect(r).toBeCloseTo(-9.7, 0);
    expect(sim.presence).toBe('empty');
  });

  it('Rauschen ist ≈ ±1–2 N (SD ~1 N je Platte)', async () => {
    const sim = new SimulatorAdapter({ clock: 'manual', seed: 4 });
    await sim.connect();
    const got: Sample[] = [];
    sim.onSample((b) => got.push(...b));
    sim.advance(3000);
    const l = got.map((s) => s.left);
    const m = l.reduce((a, b) => a + b, 0) / l.length;
    const sd = Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / (l.length - 1));
    expect(sd).toBeGreaterThan(0.7);
    expect(sd).toBeLessThan(1.5);
  });

  it('stepOn → Person steht; Last/Asymmetrie/Einbeinigkeit steuerbar; Status-Events', async () => {
    const sim = new SimulatorAdapter({ clock: 'manual', seed: 5, athlete: { bodyMass: 75, asymmetry: 0.1 } });
    const statuses: string[] = [];
    sim.onStatus((s) => statuses.push(s.connection));
    await sim.connect();
    expect(statuses).toContain('connected');
    const got: Sample[] = [];
    sim.onSample((b) => got.push(...b));
    sim.stepOn();
    sim.advance(5000);
    expect(sim.presence).toBe('standing');
    const tail = got.slice(-1000);
    const mean = (f: (s: Sample) => number) => tail.reduce((a, s) => a + f(s), 0) / tail.length;
    const total = mean((s) => s.left + s.right) - (14.2 - 9.7);
    expect(total).toBeCloseTo(75 * G, -1);
    const l = mean((s) => s.left) - 14.2;
    const r = mean((s) => s.right) + 9.7;
    expect(r / (l + r)).toBeCloseTo(0.55, 1);
    await sim.disconnect();
    expect(statuses[statuses.length - 1]).toBe('disconnected');
  });

  it('setSamplingHz validiert unterstützte Raten', async () => {
    const sim = new SimulatorAdapter({ clock: 'manual' });
    await sim.connect();
    await sim.setSamplingHz(500);
    expect(sim.status.samplingHz).toBe(500);
    await expect(sim.setSamplingHz(333)).rejects.toThrow(/nicht unterstützt/);
  });

  it('Echtzeit-Takt liefert ≈ Sollrate (beschleunigt ×10) und stoppt nach disconnect', async () => {
    let now = 0;
    const sim = new SimulatorAdapter({ clock: 'realtime', speed: 10, now: () => now, batchMs: 5, seed: 6 });
    const got: Sample[] = [];
    sim.onSample((b) => got.push(...b));
    await sim.connect();
    await new Promise((r) => setTimeout(r, 30));
    expect(got.length).toBe(0); // manuelle Uhr steht
    now = 100; // 100 ms × 10 = 1 s Datenzeit
    await new Promise((r) => setTimeout(r, 30));
    expect(got.length).toBeGreaterThanOrEqual(990);
    expect(got.length).toBeLessThanOrEqual(1010);
    await sim.disconnect();
    const n = got.length;
    now = 500;
    await new Promise((r) => setTimeout(r, 30));
    expect(got.length).toBe(n);
  });
});

describe('Simulator → Jitterbuffer → Auto-Detect (alle Testtypen)', () => {
  const MASS = 83;
  const cases: Array<{
    sim: SimTrialType;
    expect: TestType;
    load?: number;
    side?: 'left' | 'right';
    hz?: number;
    opts?: Record<string, unknown>;
  }> = [
    { sim: 'cmj', expect: 'cmj' },
    { sim: 'loaded_cmj', expect: 'loaded_cmj', load: 20 },
    { sim: 'sj', expect: 'sj' },
    { sim: 'loaded_sj', expect: 'loaded_sj', load: 20 },
    { sim: 'cmrj', expect: 'cmrj' },
    { sim: 'dj', expect: 'dj' },
    { sim: 'hop', expect: 'hop' },
    { sim: 'sl_jump', expect: 'sl_jump', side: 'left' },
    { sim: 'sl_cmrj', expect: 'sl_cmrj', side: 'right' },
    { sim: 'sl_dj', expect: 'sl_dj', side: 'left' },
    { sim: 'sl_hop', expect: 'sl_hop', side: 'right' },
    { sim: 'sl_hop_return', expect: 'sl_hop_return', side: 'left' },
    { sim: 'land_hold', expect: 'land_hold' },
    { sim: 'sl_land_hold', expect: 'sl_land_hold', side: 'right' },
  ];
  for (const c of cases) {
    it(`${c.sim} wird als ${c.expect} erkannt (Zero → Aufnahme → Analyse)`, async () => {
      const hz = c.hz ?? 1000;
      const sim = new SimulatorAdapter({ clock: 'manual', seed: 11, hz, athlete: { bodyMass: MASS } });
      await sim.connect();
      const rec = recorder(hz);
      sim.onSample(rec.push);
      sim.advance(2500); // leere Platte: Nullen
      const zeroEnd = 2.5;
      if (!c.sim.includes('dj') && !c.sim.includes('land_hold')) {
        sim.stepOn();
        sim.advance(3500);
      } else {
        sim.advance(1000);
      }
      if (c.load) sim.setLoad(c.load);
      sim.perform(c.sim, { side: c.side });
      let guard = 0;
      while (sim.queueLength > 0 && guard++ < 200) sim.advance(500);
      sim.advance(3000);
      const z = zeroed(rec.finish(), zeroEnd);
      expect(z.offL).toBeCloseTo(14.2, 0);
      const res = analyzeRecording(z.trace, { bodyMassKg: MASS, externalLoadKg: c.load ?? 0 });
      const types = res.reps.map((r) => r.type);
      expect(types.length).toBeGreaterThan(0);
      expect(new Set(types)).toEqual(new Set([c.expect]));
      for (const r of res.reps) expect(r.confidence).toBeGreaterThan(0.6);
      if (c.side) expect(res.reps[0]!.side).toBe(c.side);
    });
  }

  it('Abalakov wird als CMJ geliefert, aber manuell als abalakov analysierbar (nicht auto-erkennbar)', async () => {
    const sim = new SimulatorAdapter({ clock: 'manual', seed: 12, athlete: { bodyMass: MASS } });
    await sim.connect();
    const rec = recorder(1000);
    sim.onSample(rec.push);
    sim.advance(2500);
    sim.stepOn();
    sim.advance(3500);
    sim.perform('abalakov');
    sim.advance(6000);
    const z = zeroed(rec.finish(), 2.5);
    const auto = analyzeRecording(z.trace, { bodyMassKg: MASS });
    expect(auto.reps[0]!.type).toBe('cmj');
    const manual = analyzeRecording(z.trace, { bodyMassKg: MASS, mode: 'abalakov' });
    expect(manual.reps[0]!.type).toBe('abalakov');
  });

  it('Gewichts-Rocking, Fehlversuch und Mehrfachversuche in einer Aufnahme', async () => {
    const sim = new SimulatorAdapter({
      clock: 'manual',
      seed: 13,
      athlete: { bodyMass: MASS, rockingFrac: 0.03 },
    });
    await sim.connect();
    const rec = recorder(1000);
    sim.onSample(rec.push);
    sim.advance(2500);
    sim.stepOn();
    sim.advance(3000);
    for (const t of ['cmj', 'failed_attempt', 'cmj', 'sj'] as const) {
      sim.perform(t);
      sim.advance(7000);
    }
    const z = zeroed(rec.finish(), 2.5);
    const res = analyzeRecording(z.trace, { bodyMassKg: MASS });
    expect(res.reps.map((r) => r.type)).toEqual(['cmj', 'cmj', 'sj']);
    expect(res.warnings.filter((w) => w.code === 'failed_attempt')).toHaveLength(1);
    // Sprunghöhe im plausiblen Rahmen des Athleten (Standard 38 cm ± 12 %)
    for (const r of res.reps) {
      expect(r.metrics['jump_height_impmom']!).toBeGreaterThan(25);
      expect(r.metrics['jump_height_impmom']!).toBeLessThan(45);
    }
  });

  it('Paketverlust/Umsortieren/Jitter: Pipeline übersteht Störungen und liefert dasselbe Ergebnis (±0,5 cm)', async () => {
    const run = async (impair?: { dropProb?: number; reorderProb?: number; timestampJitterUs?: number }) => {
      const sim = new SimulatorAdapter({ clock: 'manual', seed: 21, athlete: { bodyMass: MASS }, impair });
      await sim.connect();
      const rec = recorder(1000);
      sim.onSample(rec.push);
      sim.advance(2500);
      sim.stepOn();
      sim.advance(3500);
      sim.perform('cmj', { jumpHeightM: 0.4 });
      sim.advance(7000);
      const z = zeroed(rec.finish(), 2.5);
      return { res: analyzeRecording(z.trace, { bodyMassKg: MASS }), stats: rec.jb.stats };
    };
    const clean = await run();
    const dirty = await run({ dropProb: 0.003, reorderProb: 0.05, timestampJitterUs: 150 });
    expect(dirty.stats.lost).toBeGreaterThan(5);
    expect(dirty.stats.outOfOrder).toBeGreaterThan(0);
    expect(dirty.res.reps).toHaveLength(1);
    expect(
      Math.abs(
        dirty.res.reps[0]!.metrics['jump_height_impmom']! - clean.res.reps[0]!.metrics['jump_height_impmom']!,
      ),
    ).toBeLessThan(0.5);
  });
});

describe('FileReplayAdapter', () => {
  const csv = readFileSync(new URL('../../../reference/forcedecks_sj_trial3.csv', import.meta.url), 'utf8');
  it('spielt die Referenzdatei unverändert ab: Analyse identisch zur direkten Analyse', async () => {
    const direct = parseForceTraceCsv(csv);
    const adapter = FileReplayAdapter.fromCsv(csv, { clock: 'manual', batchMs: 10 });
    expect(adapter.weightKg).toBe(90.49);
    await adapter.connect();
    const rec = recorder(adapter.info.supportedHz[0]!);
    adapter.onSample(rec.push);
    adapter.advance(10_000);
    expect(adapter.finished).toBe(true);
    const trace = rec.finish();
    expect(trace.left.length).toBe(direct.trace.left.length);
    const a = analyzeRecording(trace, { bodyMassKg: adapter.weightKg });
    const b = analyzeRecording(direct.trace, { bodyMassKg: direct.weightKg });
    expect(a.reps[0]!.type).toBe('sj');
    expect(a.reps[0]!.metrics['jump_height_impmom']).toBeCloseTo(
      b.reps[0]!.metrics['jump_height_impmom']!,
      6,
    );
    expect(rec.jb.stats.lost).toBe(0);
  });
  it('seek, loop und Beschleunigung', async () => {
    const adapter = FileReplayAdapter.fromCsv(csv, { clock: 'manual', loop: true });
    await adapter.connect();
    let n = 0;
    adapter.onSample((b) => (n += b.length));
    adapter.seek(adapter.length - 100);
    adapter.advance(500); // 100 bis Ende + Schleife
    expect(n).toBe(500);
    expect(adapter.position).toBe(400);
  });
});

describe('Simulator: Isometrie und Balance (mit Eckensensoren)', () => {
  const MASS = 80;
  it('IMTP/Isometric/Shoulder werden als Kontraktion mit plausiblen Metriken analysiert', async () => {
    for (const type of [
      'imtp',
      'iso_squat',
      'shoulder_iso_i',
      'shoulder_iso_y',
      'shoulder_iso_t',
      'isometric',
    ] as const) {
      const sim = new SimulatorAdapter({ clock: 'manual', seed: 31, athlete: { bodyMass: MASS } });
      await sim.connect();
      const rec = recorder(1000);
      sim.onSample(rec.push);
      sim.advance(2500);
      sim.stepOn();
      sim.advance(3500);
      sim.perform(type);
      let guard = 0;
      while (sim.queueLength > 0 && guard++ < 100) sim.advance(500);
      sim.advance(1000);
      const z = zeroed(rec.finish(), 2.5);
      const res = analyzeRecording(z.trace, { mode: type, bodyMassKg: MASS });
      expect(res.reps, type).toHaveLength(1);
      expect(res.reps[0]!.metrics['iso_net_peak_force']!, type).toBeGreaterThan(
        type.startsWith('shoulder') ? 100 : 800,
      );
      expect(res.reps[0]!.metrics['iso_time_to_peak']!, type).toBeGreaterThan(0.5);
    }
  });

  it('Quiet Stand/SL Stand/Range of Stability mit 200 Hz: CoP aus Eckensensoren, Metriken plausibel', async () => {
    const hz = 200;
    const out: Record<string, Record<string, number | null>> = {};
    for (const [type, side, unstable] of [
      ['quiet_stand', undefined, false],
      ['quiet_stand', undefined, true],
      ['sl_stand', 'left', false],
      ['sl_range_of_stability', 'right', false],
    ] as const) {
      const sim = new SimulatorAdapter({
        clock: 'manual',
        seed: 32,
        hz,
        corners: true,
        athlete: { bodyMass: MASS },
      });
      await sim.connect();
      expect(sim.info.hasCorners).toBe(true);
      const jb = new JitterBuffer({ hz, hasCorners: true });
      const L: number[] = [];
      const R: number[] = [];
      const C: number[] = [];
      const add = (c: ReturnType<JitterBuffer['push']>) => {
        L.push(...c.left);
        R.push(...c.right);
        C.push(...Array.from(c.corners!));
      };
      sim.onSample((b) => add(jb.push(b)));
      sim.advance(2500);
      sim.stepOn();
      sim.advance(3500);
      sim.perform(type, { side, unstable, durationS: 30 });
      let guard = 0;
      while (sim.queueLength > 0 && guard++ < 200) sim.advance(1000);
      add(jb.flush());
      const trace: ForceTrace = { hz, left: Float32Array.from(L), right: Float32Array.from(R) };
      const z = zeroed(trace, 2.5);
      // Roh-Offsets sind je Ecke verteilt; vor der CoP-Berechnung entfernen (Verhältnisse bleiben sonst leicht verzerrt)
      const corners = Float32Array.from(C, (v, i) => v - (i % 8 < 4 ? z.offL : z.offR) / 4);
      const cop = copFromCorners(corners);
      const start = Math.round(6 * hz); // ab Teststart (nach Zero + Stehen)
      const sub = {
        hz,
        left: z.trace.left.subarray(start),
        right: z.trace.right.subarray(start),
        copX: cop.x.subarray(start),
        copY: cop.y.subarray(start),
      };
      const res = analyzeRecording(sub, { mode: type, bodyMassKg: MASS });
      expect(res.reps).toHaveLength(1);
      out[`${type}${unstable ? '+unstable' : ''}`] = res.reps[0]!.metrics;
      if (side) expect(res.reps[0]!.side).toBe(side);
    }
    const q = out['quiet_stand']!;
    expect(q['cop_path_length']!).toBeGreaterThan(300);
    expect(q['cop_area_95']!).toBeGreaterThan(50);
    expect(out['quiet_stand+unstable']!['cop_path_length']!).toBeGreaterThan(q['cop_path_length']! * 1.5);
    expect(out['sl_stand']!['cop_ml_sd']!).toBeGreaterThan(q['cop_ml_sd']!);
    expect(out['sl_range_of_stability']!['cop_hull_area']!).toBeGreaterThan(
      out['sl_stand']!['cop_hull_area']!,
    );
  });
});
