import { describe, expect, it } from 'vitest';
import { JitterBuffer, type Sample } from '../src/index.ts';

const mk = (n: number, hz = 1000, t0 = 0): Sample[] =>
  Array.from({ length: n }, (_, i) => ({ t: t0 + (i * 1e6) / hz, left: i, right: 2 * i, seq: i & 0xffff }));
const run = (jb: JitterBuffer, batches: Sample[][]) => {
  const L: number[] = [];
  const breaks: number[] = [];
  let flags: number[] = [];
  for (const b of batches) {
    const c = jb.push(b);
    for (const k of c.breaks) breaks.push(L.length + k);
    L.push(...c.left);
    flags = flags.concat(Array.from(c.interpolated));
  }
  const f = jb.flush();
  for (const k of f.breaks) breaks.push(L.length + k);
  L.push(...f.left);
  flags = flags.concat(Array.from(f.interpolated));
  return { L, breaks, flags };
};
const chunk = (a: Sample[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

describe('JitterBuffer', () => {
  it('ideale Eingabe: unverändert, ohne Verluste', () => {
    const jb = new JitterBuffer({ hz: 1000 });
    const r = run(jb, chunk(mk(500), 10));
    expect(r.L).toEqual(Array.from({ length: 500 }, (_, i) => i));
    expect(jb.stats.lost).toBe(0);
    expect(jb.stats.lossRatePct).toBe(0);
    expect(jb.stats.received).toBe(500);
  });

  it('sortiert vertauschte Pakete innerhalb des Umsortierfensters und zählt out-of-order', () => {
    const s = mk(300);
    for (let i = 10; i < 290; i += 7) [s[i], s[i + 1]] = [s[i + 1]!, s[i]!];
    const jb = new JitterBuffer({ hz: 1000 });
    const r = run(jb, chunk(s, 12));
    expect(r.L).toEqual(Array.from({ length: 300 }, (_, i) => i));
    expect(jb.stats.outOfOrder).toBeGreaterThan(20);
    expect(jb.stats.lost).toBe(0);
  });

  it('entfernt Duplikate', () => {
    const s = mk(100);
    const dup = [...s.slice(0, 50), s[49]!, s[49]!, ...s.slice(50)];
    const jb = new JitterBuffer({ hz: 1000 });
    const r = run(jb, chunk(dup, 10));
    expect(r.L).toHaveLength(100);
    expect(jb.stats.duplicates).toBe(2);
  });

  it('rastet verjitterte Zeitstempel (±0,3 ms) auf das Raster ein: keine Duplikate/Löcher', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 600;
    const s = mk(2000).map((x) => ({ ...x, t: x.t + rnd() }));
    const jb = new JitterBuffer({ hz: 1000 });
    const r = run(jb, chunk(s, 10));
    expect(r.L).toHaveLength(2000);
    expect(jb.stats.lost).toBe(0);
    expect(r.flags.some((f) => f === 1)).toBe(false);
  });

  it('interpoliert einzelne verlorene Samples linear und zählt Verlust (ohne und mit Paketnummern)', () => {
    const s = mk(200).filter((x) => x.left !== 100 && x.left !== 101 && x.left !== 150);
    const jb = new JitterBuffer({ hz: 1000 });
    const r = run(jb, chunk(s, 10));
    expect(r.L).toHaveLength(200);
    expect(r.L[100]).toBeCloseTo(100, 6);
    expect(r.L[101]).toBeCloseTo(101, 6);
    expect(r.L[150]).toBeCloseTo(150, 6);
    expect(r.flags[100]).toBe(1);
    expect(jb.stats.interpolated).toBe(3);
    expect(jb.stats.lost).toBe(3);
    expect(jb.stats.lostBySeq).toBe(3);
    expect(jb.stats.lossRatePct).toBeCloseTo((3 / 200) * 100, 3); // 197 empfangen + 3 verloren
  });

  it('lange Lücke (> 30 Samples) ⇒ Unterbrechung statt Interpolation; Zeitraster rastet danach neu ein', () => {
    const s = mk(400).filter((x) => x.left < 100 || x.left >= 180);
    const jb = new JitterBuffer({ hz: 1000, maxInterpolateSamples: 30 });
    const r = run(jb, chunk(s, 10));
    expect(r.L).toHaveLength(320);
    expect(r.breaks).toEqual([100]);
    expect(jb.stats.breaks).toBe(1);
    expect(jb.stats.lost).toBe(80);
    expect(r.flags.every((f) => f === 0)).toBe(true);
    expect(r.L[100]).toBe(180);
  });

  it('Uhrendrift (Gerät 0,2 % schneller) erzeugt weder Löcher noch Unterbrechungen', () => {
    const s = mk(3000).map((x) => ({ ...x, t: x.t * 0.998 }));
    const jb = new JitterBuffer({ hz: 1000 });
    const r = run(jb, chunk(s, 10));
    expect(jb.stats.breaks).toBe(0);
    expect(r.L.length).toBeGreaterThan(2990);
    expect(r.L.length).toBeLessThanOrEqual(3000);
  });

  it('Paketnummern-Überlauf (u16) wird korrekt behandelt', () => {
    const s = Array.from({ length: 200 }, (_, i) => ({
      t: (i * 1e6) / 1000,
      left: i,
      right: i,
      seq: (65500 + i) % 65536,
    }));
    const jb = new JitterBuffer({ hz: 1000 });
    run(jb, chunk(s, 10));
    expect(jb.stats.lostBySeq).toBe(0);
  });

  it('Eckensensoren werden mitgeführt und interpoliert', () => {
    const s: Sample[] = mk(50).map((x) => ({ ...x, corners: [x.left, x.left, x.left, x.left, 0, 0, 0, 0] }));
    const gap = s.filter((x) => x.left !== 20);
    const jb = new JitterBuffer({ hz: 1000, hasCorners: true });
    const chunks = [...chunk(gap, 10).map((b) => jb.push(b)), jb.flush()];
    const corners = chunks.flatMap((c) => Array.from(c.corners ?? []));
    expect(corners).toHaveLength(50 * 8);
    expect(corners[20 * 8]).toBeCloseTo(20, 6);
  });
});
