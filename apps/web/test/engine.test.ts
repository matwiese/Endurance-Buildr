import type { LiveEvent } from '@buildr/core';
import { SimulatorAdapter } from '@buildr/device';
import { describe, expect, it } from 'vitest';
import { LiveEngine, type EngineEvent } from '../src/live/engine.ts';
import { InlineWorker } from '../src/live/workerClient.ts';
import { RingBuffer, decimateMinMax } from '../src/live/ringBuffer.ts';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function setup(opts: { mode?: 'auto' | 'cmj'; hz?: number; mass?: number } = {}) {
  const hz = opts.hz ?? 1000;
  const sim = new SimulatorAdapter({ clock: 'manual', seed: 5, hz, athlete: { bodyMass: opts.mass ?? 82 } });
  let nowMs = 0;
  const engine = new LiveEngine(sim, {
    mode: opts.mode ?? 'auto',
    externalLoadKg: 0,
    workerFactory: () => new InlineWorker(),
    now: () => nowMs,
  });
  const live: LiveEvent[] = [];
  const all: EngineEvent[] = [];
  engine.subscribe((e) => {
    all.push(e);
    if (e.type === 'live') live.push(e.e);
  });
  await engine.connect();
  const adv = async (ms: number) => {
    for (let t = 0; t < ms; t += 100) {
      nowMs += 100;
      sim.advance(Math.min(100, ms - t));
    }
    await tick();
  };
  return { sim, engine, live, all, adv, hz };
}

describe('LiveEngine (Simulator → Jitterbuffer → Ring + Worker)', () => {
  it('Nullen: Offsets werden gefunden, danach liegen die Ringpuffer-Daten bei ≈ 0 N', async () => {
    const { engine, live, adv } = await setup();
    engine.startZero();
    expect(engine.zeroCollecting).toBe(true);
    await adv(3500);
    const z = live.find((e) => e.type === 'zero');
    expect(z).toMatchObject({ type: 'zero', ok: true });
    expect(engine.offsets.left).toBeCloseTo(14.2, 0);
    expect(engine.zeroCollecting).toBe(false);
    // neue Daten sind genullt
    await adv(1500);
    let s = 0;
    const n = 500;
    for (let i = engine.ring.count - n; i < engine.ring.count; i++) s += engine.ring.at(i).l;
    expect(Math.abs(s / n)).toBeLessThan(1.2);
    engine.dispose();
  });

  it('Wiegen → Aufnahme → CMJ: Sofortergebnis, Marker auf der richtigen Ringposition', async () => {
    const { sim, engine, live, adv } = await setup({ mass: 82 });
    engine.startZero();
    await adv(3500);
    sim.stepOn();
    engine.startWeigh();
    await adv(5000);
    const ws = live.filter((e): e is Extract<LiveEvent, { type: 'weigh' }> => e.type === 'weigh');
    expect(ws.some((w) => w.state.stable)).toBe(true);
    const kg = await engine.lockWeight();
    expect(Math.abs(kg! - 82)).toBeLessThan(0.4);
    expect(await engine.startRecording()).toBe(true);
    sim.perform('cmj', { jumpHeightM: 0.4 });
    await adv(9000);
    const reps = live.filter((e): e is Extract<LiveEvent, { type: 'reps' }> => e.type === 'reps');
    expect(reps).toHaveLength(1);
    expect(reps[0]!.reps[0]!.type).toBe('cmj');
    const marker = live.find(
      (e): e is Extract<LiveEvent, { type: 'marker' }> => e.type === 'marker' && e.kind === 'takeoff',
    )!;
    const ringIdx = marker.ringIdx!;
    expect(ringIdx).toBeGreaterThan(0);
    // einige Samples nach dem Marker ist die Platte unbelastet, davor belastet
    const sum = (i: number) => engine.ring.at(i).l + engine.ring.at(i).r;
    expect(sum(Math.floor(ringIdx) - 20)).toBeGreaterThan(200);
    expect(Math.abs(sum(Math.floor(ringIdx) + 40))).toBeLessThan(15);
    const res = await engine.stop();
    expect(res!.analysis.reps).toHaveLength(1);
    expect(res!.recording.trace.left.length).toBeGreaterThan(7000);
    engine.dispose();
  });

  it('Pause/Fortsetzen und Re-Zero: Marker-Positionen im Plot bleiben exakt (Chunk-Tags), Aufnahme enthält keine Pausendaten', async () => {
    const { sim, engine, live, adv } = await setup({ mode: 'cmj' });
    engine.startZero();
    await adv(3500);
    sim.stepOn();
    await adv(3000);
    engine.setMass(82);
    await engine.startRecording();
    await adv(1000);
    engine.pause();
    await adv(500);
    engine.resume();
    await adv(1000);
    // Re-Zero mit Person auf der Platte ⇒ kontrolliertes Scheitern, Aufnahme geht weiter
    engine.rezero();
    await adv(12_000);
    const zeros = live.filter(
      (e): e is Extract<LiveEvent, { type: 'zero'; ok: false }> => e.type === 'zero' && !e.ok,
    );
    expect(zeros.length).toBeGreaterThan(0);
    expect(zeros.at(-1)!.during).toBe('recording');
    // Fehlversuch (Gegenbewegung) im fortgesetzten Teil: Marker-Ringposition = tatsächliche Kante im Plot
    sim.perform('cmj', { jumpHeightM: 0.4 });
    await adv(9000);
    const marker = live.find(
      (e): e is Extract<LiveEvent, { type: 'marker' }> => e.type === 'marker' && e.kind === 'takeoff',
    )!;
    const sum = (i: number) => engine.ring.at(i).l + engine.ring.at(i).r;
    const r = marker.ringIdx!;
    expect(sum(Math.floor(r) - 3)).toBeGreaterThan(20);
    expect(sum(Math.floor(r) + 3)).toBeLessThan(20);
    const res = await engine.stop();
    expect(res).not.toBeNull();
    expect(res!.recording.trace.breaks!.length).toBeGreaterThanOrEqual(2);
    // Pause (500 ms) und Re-Zero-Sammelphase (5 s) sind nicht in der Aufnahme
    expect(res!.recording.trace.left.length).toBeLessThan(1000 + 1000 + 7000 + 9000 + 100);
    engine.dispose();
  });

  it('Auto Detect ohne Gewicht: Aufnahme abgelehnt', async () => {
    const { engine, live } = await setup();
    expect(await engine.startRecording()).toBe(false);
    expect(live.some((e) => e.type === 'error' && e.code === 'weight_required')).toBe(true);
    expect(engine.recordingActive).toBe(false);
    engine.dispose();
  });

  it('Re-Analyse (Worker-Request) liefert dieselben Metriken wie die Live-Auswertung', async () => {
    const { sim, engine, adv } = await setup({ mode: 'cmj' });
    engine.startZero();
    await adv(3500);
    sim.stepOn();
    await adv(3000);
    engine.setMass(82);
    await engine.startRecording();
    sim.perform('cmj');
    await adv(9000);
    const res = (await engine.stop())!;
    const again = await engine.analyze(res.recording.trace, { mode: 'cmj', bodyMassKg: 82 });
    expect(again.reps[0]!.metrics['jump_height_impmom']).toBeCloseTo(
      res.analysis.reps[0]!.metrics['jump_height_impmom']!,
      9,
    );
    engine.dispose();
  });

  it('Latenzabschätzung unter 100 ms (Haltezeit + Alter des neuesten Samples)', async () => {
    const { engine, adv } = await setup();
    await adv(500);
    const l = engine.noteFrame(engine.ring.lastPushMs + 16);
    expect(l).toBeGreaterThan(20);
    expect(l).toBeLessThan(100);
    engine.dispose();
  });
});

describe('RingBuffer / Dezimierung', () => {
  it('überschreibt älteste Daten, globale Indizes bleiben monoton, Offsets werden abgezogen', () => {
    const r = new RingBuffer(100);
    const a = Float32Array.from({ length: 80 }, (_, i) => i + 10);
    r.push(a, a, 10, 5, 1);
    r.push(a, a, 10, 5, 2);
    expect(r.count).toBe(160);
    expect(r.firstIdx).toBe(60);
    expect(r.at(159).l).toBe(79 + 10 - 10);
    expect(r.at(159).r).toBe(79 + 10 - 5);
    expect(r.at(80).l).toBe(0);
  });
  it('Min/Max-Dezimierung erhält jede Spitze (kein Datenverlust beim Rendern)', () => {
    const n = 100_000;
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = Math.sin(i / 50);
    data[54_321] = 9;
    data[77_777] = -9;
    const d = decimateMinMax((i) => data[i]!, 0, n, 800);
    expect(Math.max(...d.max)).toBe(9);
    expect(Math.min(...d.min)).toBe(-9);
    expect(d.max.length).toBe(800);
    // jede Spalte deckt ihren Bereich ab
    expect(d.min[0]!).toBeLessThanOrEqual(data[0]!);
    expect(d.max[799]!).toBeGreaterThanOrEqual(data[n - 1]!);
  });
});
