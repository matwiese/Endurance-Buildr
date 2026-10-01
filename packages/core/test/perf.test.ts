import { describe, expect, it } from 'vitest';
import {
  analyzeRecording,
  decodeBlob,
  encodeBlob,
  hopTrial,
  jumpTrial,
  LiveAnalyzer,
  NO_COMPRESSION,
  renderScript,
  standProfile,
  withRest,
  type ForceTrace,
} from '../src/index.ts';

/**
 * Rechenzeit-Budgets (großzügig, damit CI-Rechner nicht flackern; tatsächliche Werte stehen in docs/performance.md).
 * Ziel der Aufgabe: Live-Anzeige 60 fps bei 2 × 1000 Hz, Ergebnis < 100 ms nach Landung.
 */
const time = <T>(fn: () => T): { ms: number; value: T } => {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
};

const mass = 80;
const render = (profiles: Parameters<typeof renderScript>[0], seed: number) =>
  renderScript(profiles, { hz: 1000, seed, athlete: { bodyMass: mass } });

describe('Rechenzeit-Budgets', () => {
  it('Nachanalyse: 10-fach-Hop-Serie (≈ 20 s, 2 × 1000 Hz) in < 500 ms', () => {
    const r = render(withRest({ mass }, hopTrial({ mass, heights: Array(10).fill(0.3) })), 3);
    expect(r.trace.left.length).toBeGreaterThan(8000);
    analyzeRecording(r.trace, { mode: 'hop', bodyMassKg: mass }); // Aufwärmen (JIT)
    const { ms, value } = time(() => analyzeRecording(r.trace, { mode: 'hop', bodyMassKg: mass }));
    expect(value.reps.length).toBeGreaterThanOrEqual(8);
    expect(ms).toBeLessThan(500);
  });

  it('Nachanalyse: 10 Minuten Aufnahme (1,2 Mio. Werte) mit Auto-Erkennung in < 5 s', () => {
    // 60 CMJ im Abstand von 10 s
    const profiles = [
      standProfile(mass, 3),
      ...Array.from({ length: 60 }, () => [
        ...jumpTrial({ mass, jumpHeight: 0.35 }),
        standProfile(mass, 8),
      ]).flat(),
    ];
    const r = render(profiles, 4);
    expect(r.trace.left.length).toBeGreaterThan(550_000);
    const { ms, value } = time(() => analyzeRecording(r.trace, { mode: 'auto', bodyMassKg: mass }));
    expect(value.reps.length).toBeGreaterThanOrEqual(55);
    expect(ms).toBeLessThan(5000);
  });

  it('Live-Verarbeitung: 60 s Daten in 10-ms-Paketen laufen ≥ 20× schneller als Echtzeit', () => {
    const r = render(withRest({ mass }, jumpTrial({ mass, jumpHeight: 0.4 }), 28, 28), 5);
    const live = new LiveAnalyzer(() => undefined, { hz: 1000 });
    live.startRecording();
    const { l, rr } = { l: r.trace.left, rr: r.trace.right };
    const { ms } = time(() => {
      for (let i = 0; i < l.length; i += 10) live.push(l.subarray(i, i + 10), rr.subarray(i, i + 10));
    });
    const seconds = l.length / 1000;
    expect(seconds).toBeGreaterThan(55);
    expect(ms).toBeLessThan((seconds * 1000) / 20);
  });

  it('Aufnahme-Blob: 10 Minuten (2 × 600 000 Werte) kodieren + dekodieren in < 3 s, verlustfrei', async () => {
    const n = 600_000;
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = 400 + 200 * Math.sin(i / 300) + (i % 7) * 0.001;
      right[i] = 380 + 190 * Math.sin(i / 310);
    }
    const trace: ForceTrace = { hz: 1000, left, right };
    const t0 = performance.now();
    const bytes = await encodeBlob(trace, NO_COMPRESSION);
    const back = await decodeBlob(bytes, [NO_COMPRESSION]);
    const ms = performance.now() - t0;
    expect(back.left.length).toBe(n);
    expect(back.hz).toBe(1000);
    for (const i of [0, 1, 12345, n - 1]) {
      expect(back.left[i]).toBeCloseTo(left[i]!, 2); // 1 mN Auflösung
      expect(back.right[i]).toBeCloseTo(right[i]!, 2);
    }
    expect(ms).toBeLessThan(3000);
  });
});
