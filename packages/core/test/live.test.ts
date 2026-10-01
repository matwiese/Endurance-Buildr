import { describe, expect, it } from 'vitest';
import {
  G,
  LiveAnalyzer,
  cmrjTrial,
  djTrial,
  emptyProfile,
  failedAttempt,
  hopTrial,
  jumpTrial,
  renderScript,
  standProfile,
  stepOnLeadIn,
  stepOnProfile,
  withRest,
  type LiveEvent,
  type Profile,
  type RenderedScript,
} from '../src/index.ts';

const HZ = 1000;
const OFF = { l: 14.2, r: -9.7 };

class Harness {
  events: Array<{ at: number; e: LiveEvent }> = [];
  pos = 0;
  live: LiveAnalyzer;
  constructor(opts: ConstructorParameters<typeof LiveAnalyzer>[1] = { hz: HZ }) {
    this.live = new LiveAnalyzer((e) => this.events.push({ at: this.pos, e }), opts);
  }
  /** Rohdaten (mit Offsets) in 10-Sample-Paketen einspeisen */
  feed(r: RenderedScript, chunk = 10, from = 0, to = r.trace.left.length) {
    const l = r.trace.left.map((v) => v + OFF.l);
    const rr = r.trace.right.map((v) => v + OFF.r);
    for (let i = from; i < to; i += chunk) {
      const e = Math.min(to, i + chunk);
      this.pos = e;
      this.live.push(l.subarray(i, e), rr.subarray(i, e));
    }
  }
  of<T extends LiveEvent['type']>(t: T) {
    return this.events.filter((x) => x.e.type === t) as Array<{
      at: number;
      e: Extract<LiveEvent, { type: T }>;
    }>;
  }
}
const render = (p: Profile[], seed: number, mass = 80, athlete = {}) =>
  renderScript(p, { hz: HZ, seed, athlete: { bodyMass: mass, ...athlete } });

describe('LiveAnalyzer – Nullen', () => {
  it('Offsets je Platte ±0,5 N; Phase zeroing → idle; meldet Erfolg binnen ~1,5 s', () => {
    const h = new Harness();
    h.live.startZero();
    expect(h.live.phase).toBe('zeroing');
    h.feed(render([emptyProfile(4)], 1));
    const z = h.of('zero');
    expect(z).toHaveLength(1);
    const e = z[0]!.e as Extract<LiveEvent, { type: 'zero'; ok: true }>;
    expect(e.ok).toBe(true);
    expect(e.offsetLeft).toBeCloseTo(OFF.l, 0);
    expect(e.offsetRight).toBeCloseTo(OFF.r, 0);
    expect(z[0]!.at).toBeLessThan(2000);
    expect(h.live.phase).toBe('idle');
    expect(h.live.offsets.zeroed).toBe(true);
  });
  it('wartet, bis die Person die Platte verlassen hat (nichts auf die Platten stellen)', () => {
    const h = new Harness();
    h.live.startZero();
    // erst Person drauf (3 s), dann leer (3 s)
    h.feed(render([standProfile(80, 3), emptyProfile(3)], 2));
    const z = h.of('zero').filter((x) => (x.e as { ok: boolean }).ok);
    expect(z).toHaveLength(1);
    expect(z[0]!.at).toBeGreaterThanOrEqual(4000);
    expect((z[0]!.e as { offsetLeft: number }).offsetLeft).toBeCloseTo(OFF.l, 0);
  });
  it('bleibt belastet ⇒ Fehler nach maxWait, kein Absturz, Offsets bleiben unverändert', () => {
    const h = new Harness();
    h.live.startZero();
    h.feed(render([standProfile(80, 12)], 3));
    const z = h.of('zero');
    expect(z).toHaveLength(1);
    expect((z[0]!.e as { ok: boolean }).ok).toBe(false);
    expect(h.live.offsets.zeroed).toBe(false);
    expect(h.live.phase).toBe('idle');
  });
});

describe('LiveAnalyzer – Wiegen', () => {
  it('Ampel wird grün, lockWeight liefert Masse ±0,3 kg; davor null; Wiegen ohne Nullen meldet Hinweis', () => {
    const h = new Harness();
    h.live.startWeigh();
    expect(h.of('error')[0]!.e).toMatchObject({ code: 'not_zeroed' });
    const h2 = new Harness();
    h2.live.startZero();
    h2.feed(render([emptyProfile(3)], 4));
    h2.live.startWeigh();
    expect(h2.live.lockWeight()).toBeNull();
    const w = render([stepOnProfile(81.3, 0.9), standProfile(81.3, 3)], 5, 81.3);
    h2.feed(w);
    const ws = h2.of('weigh');
    expect(ws.length).toBeGreaterThan(10);
    const firstStable = ws.find((x) => x.e.state.stable)!;
    expect(firstStable).toBeDefined();
    expect(firstStable.at).toBeGreaterThan(1000); // erst nach einem vollen stabilen 1-s-Fenster
    const kg = h2.live.lockWeight()!;
    expect(Math.abs(kg - 81.3)).toBeLessThan(0.3);
    expect(h2.live.bodyMassKg).toBe(kg);
    expect(h2.of('weight').pop()!.e).toMatchObject({ source: 'weighed' });
    expect(h2.live.phase).toBe('idle');
  });
});

function prepared(mass: number, mode: 'auto' | 'cmj' = 'auto') {
  const h = new Harness({ hz: HZ, mode });
  h.live.startZero();
  h.feed(render([emptyProfile(3)], 6));
  h.live.setMass(mass, 'weighed');
  return h;
}

describe('LiveAnalyzer – Aufnahme und Sofortergebnisse', () => {
  it('Auto Detect: ohne Gewicht keine Aufnahme (Fehler weight_required)', () => {
    const h = new Harness({ hz: HZ, mode: 'auto' });
    expect(h.live.startRecording()).toBe(false);
    expect(h.of('error')[0]!.e).toMatchObject({ code: 'weight_required' });
  });

  it('CMJ: Takeoff-/Landemarker live, Ergebnis ≤ 1,8 s nach der Landung, Typ cmj', () => {
    const mass = 80;
    const h = prepared(mass);
    expect(h.live.startRecording()).toBe(true);
    const r = render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.4 })), 7);
    h.feed(r);
    const tk = h.of('marker').filter((x) => x.e.kind === 'takeoff');
    const ld = h.of('marker').filter((x) => x.e.kind === 'landing');
    expect(tk).toHaveLength(1);
    expect(ld).toHaveLength(1);
    const seg = r.segments.find((s) => s.kind === 'flight')!;
    expect(Math.abs(tk[0]!.e.idx - seg.start * HZ)).toBeLessThan(3);
    expect(Math.abs(ld[0]!.e.idx - seg.end * HZ)).toBeLessThan(3);
    // Takeoff wird erst nach Bestätigung (≥ 80 ms Flug) gemeldet, aber deutlich vor der Landung
    expect(tk[0]!.at).toBeLessThan(ld[0]!.at);
    const reps = h.of('reps');
    expect(reps).toHaveLength(1);
    expect(reps[0]!.e.reps[0]!.type).toBe('cmj');
    expect(reps[0]!.at - ld[0]!.e.idx).toBeLessThan(1800);
    expect(reps[0]!.at - ld[0]!.e.idx).toBeGreaterThan(500);
    expect(Math.abs(reps[0]!.e.reps[0]!.metrics['jump_height_impmom']! - 40)).toBeLessThan(0.5);
    // Indizes beziehen sich auf die Aufnahme
    expect(Math.abs(reps[0]!.e.reps[0]!.events['takeoff']! - tk[0]!.e.idx)).toBeLessThan(1.5);
  });

  it('mehrere Testtypen in einer Aufnahme: Reps in Reihenfolge, Stopp liefert dieselbe Gesamtanalyse', () => {
    const mass = 78;
    const h = prepared(mass);
    h.live.startRecording();
    const r = render(
      [
        ...stepOnLeadIn({ mass }),
        ...jumpTrial({ mass, jumpHeight: 0.3 }),
        standProfile(mass, 3),
        ...failedAttempt({ mass }),
        standProfile(mass, 3),
        ...jumpTrial({ mass, jumpHeight: 0.33, kind: 'sj' }),
        standProfile(mass, 3),
        ...cmrjTrial({ mass, jumpHeight: 0.35, reboundHeight: 0.27 }),
        standProfile(mass, 3),
        ...hopTrial({ mass, heights: [0.08, 0.14, 0.15, 0.16, 0.15, 0.14], contact: 0.19 }),
        standProfile(mass, 3),
      ],
      8,
      mass,
    );
    h.feed(r);
    const liveReps = h.of('reps').flatMap((x) => x.e.reps);
    const types = liveReps.map((x) => x.type);
    expect(types.slice(0, 3)).toEqual(['cmj', 'sj', 'cmrj']);
    expect(types.slice(3).every((t) => t === 'hop')).toBe(true);
    expect(types).toHaveLength(3 + 6);
    const stopped = h.live.stop()!;
    expect(stopped.analysis.reps.map((x) => x.type)).toEqual(types);
    stopped.analysis.reps.forEach((rep, i) => {
      const a = rep.metrics['jump_height_impmom'] ?? rep.metrics['jump_height_flight']!;
      const b = liveReps[i]!.metrics['jump_height_impmom'] ?? liveReps[i]!.metrics['jump_height_flight']!;
      expect(Math.abs(a - b)).toBeLessThan(0.15);
    });
    expect(stopped.recording.trace.left.length).toBe(r.trace.left.length);
    expect(stopped.recording.offsetLeft).toBeCloseTo(OFF.l, 0);
    expect(h.live.phase).toBe('idle');
  });

  it('Drop Jump: Aufprall-Marker, Ergebnis dj', () => {
    const mass = 80;
    const h = prepared(mass);
    h.live.startRecording();
    h.feed(
      render(
        [emptyProfile(2), ...djTrial({ mass, dropHeight: 0.3, jumpHeight: 0.3 }), standProfile(mass, 3)],
        9,
      ),
    );
    expect(h.of('marker').filter((x) => x.e.kind === 'impact')).toHaveLength(1);
    const reps = h.of('reps').flatMap((x) => x.e.reps);
    expect(reps.map((x) => x.type)).toEqual(['dj']);
  });

  it('Wiegen überspringen (fester Typ): Masse wird aus der Ruhephase geschätzt und gemeldet (estimated)', () => {
    const h = new Harness({ hz: HZ, mode: 'cmj' });
    h.live.startZero();
    h.feed(render([emptyProfile(3)], 10));
    expect(h.live.startRecording()).toBe(true);
    h.feed(render(withRest({ mass: 77 }, jumpTrial({ mass: 77, jumpHeight: 0.35 })), 11, 77));
    expect(h.live.bodyMassKg).not.toBeNull();
    expect(Math.abs(h.live.bodyMassKg! - 77)).toBeLessThan(0.6);
    expect(h.of('weight').pop()!.e).toMatchObject({ source: 'estimated' });
    expect(h.of('reps')).toHaveLength(1);
  });
});

describe('LiveAnalyzer – Pause, Re-Zero, Robustheit', () => {
  it('Pause/Fortsetzen: Daten der Pause werden nicht aufgenommen, Unterbrechung ist markiert', () => {
    const mass = 80;
    const h = prepared(mass);
    h.live.startRecording();
    const a = render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.3 })), 12);
    h.feed(a);
    h.live.pause();
    expect(h.live.phase).toBe('paused');
    h.feed(render([standProfile(mass, 2)], 13)); // während der Pause
    h.live.resume();
    h.feed(render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.35 })), 14));
    const s = h.live.stop()!;
    expect(s.recording.trace.left.length).toBe(
      a.trace.left.length +
        render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.35 })), 14).trace.left.length,
    );
    expect(s.recording.trace.breaks).toEqual([a.trace.left.length]);
    expect(s.analysis.reps.map((r) => r.type)).toEqual(['cmj', 'cmj']);
  });

  it('Re-Zero während der Aufnahme: neue Offsets, Unterbrechung markiert, kein Absturz', () => {
    const mass = 80;
    const h = prepared(mass);
    h.live.startRecording();
    const a = render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.3 })), 15);
    h.feed(a);
    const nBefore = h.live.offsets.left;
    h.live.rezero();
    h.feed(render([emptyProfile(3)], 16)); // Platte leer ⇒ Erfolg
    const zs = h.of('zero').filter((x) => (x.e as { during: string }).during === 'recording');
    expect(zs).toHaveLength(1);
    expect((zs[0]!.e as { ok: boolean }).ok).toBe(true);
    expect(h.live.phase).toBe('recording');
    expect(h.live.offsets.left).toBeCloseTo(nBefore, 0);
    h.feed(render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.33 })), 17));
    const s = h.live.stop()!;
    expect(s.recording.trace.breaks).toEqual([a.trace.left.length]);
    expect(s.analysis.reps.map((r) => r.type)).toEqual(['cmj', 'cmj']);
  });

  it('Re-Zero mit belasteten Platten schlägt kontrolliert fehl und die Aufnahme läuft weiter', () => {
    const mass = 80;
    const h = prepared(mass);
    h.live.startRecording();
    h.feed(render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.3 })), 18));
    const before = { ...h.live.offsets };
    h.live.rezero();
    h.feed(render([standProfile(mass, 12)], 19));
    const z = h.of('zero').filter((x) => (x.e as { during: string }).during === 'recording');
    expect(z).toHaveLength(1);
    expect((z[0]!.e as { ok: boolean }).ok).toBe(false);
    expect(h.live.offsets).toEqual(before);
    expect(h.live.phase).toBe('recording');
    expect(() => h.live.stop()).not.toThrow();
  });

  it('Zustandsfehler erzeugen Events statt Exceptions (stop ohne Aufnahme, doppelter Start)', () => {
    const h = new Harness({ hz: HZ, mode: 'cmj' });
    expect(h.live.stop()).toBeNull();
    expect(h.of('error')[0]!.e).toMatchObject({ code: 'bad_state' });
    expect(h.live.startRecording()).toBe(true);
    expect(h.live.startRecording()).toBe(true);
    h.live.pause();
    h.live.pause();
    h.live.resume();
    h.live.resume();
    expect(() => h.live.push(new Float32Array(0), new Float32Array(0))).not.toThrow();
  });

  it('Rechenzeit: Sofortauswertung einer Rep < 50 ms (Worker-Budget)', () => {
    const mass = 80;
    const h = prepared(mass);
    h.live.startRecording();
    const r = render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.4 })), 20);
    const t0 = performance.now();
    h.feed(r);
    const dt = performance.now() - t0;
    expect(h.of('reps')).toHaveLength(1);
    expect(dt).toBeLessThan(1500); // 7,6 s Daten in 10-ms-Paketen
    // Analysezeit einzelner Auswertung
    const t1 = performance.now();
    h.live.analyzeAll();
    expect(performance.now() - t1).toBeLessThan(50);
  });
});

void G;
