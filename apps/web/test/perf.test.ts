import { describe, expect, it } from 'vitest';
import { RingBuffer, decimateMinMax } from '../src/live/ringBuffer.ts';

/**
 * Zeichen-Budget der Live-Anzeige: bei 60 fps bleiben 16,7 ms je Bild. Pro Bild werden 3 Kurven (links, rechts, Summe) eines
 * 10-Sekunden-Fensters (10 000 Samples je Platte) auf ~1200 Pixelspalten dezimiert. Budget großzügig: < 3 ms je Bild (Mittel).
 */
describe('Live-Anzeige: Rechenbudget je Bild', () => {
  it('Dezimierung von 3 Kurven × 10 000 Samples auf 1200 Spalten: Mittel < 3 ms; Ankunftsabfrage O(1) im Mittel', () => {
    const rb = new RingBuffer(120_000); // 2 Minuten bei 1000 Hz
    const chunkL = new Float32Array(10);
    const chunkR = new Float32Array(10);
    for (let k = 0; k < 15_000; k++) {
      for (let i = 0; i < 10; i++) {
        chunkL[i] = 400 + 300 * Math.sin((k * 10 + i) / 200);
        chunkR[i] = 380 + 250 * Math.sin((k * 10 + i) / 210);
      }
      rb.push(chunkL, chunkR, 0, 0, k * 10);
    }
    const to = rb.count;
    const from = to - 10_000;
    const out = { min: new Float32Array(1200), max: new Float32Array(1200) };
    const frames = 300;
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) {
      decimateMinMax((i) => rb.at(i).l, from, to, 1200, out);
      decimateMinMax((i) => rb.at(i).r, from, to, 1200, out);
      decimateMinMax(
        (i) => {
          const s = rb.at(i);
          return s.l + s.r;
        },
        from,
        to,
        1200,
        out,
      );
      rb.arrivalOf(to - 1);
    }
    const perFrame = (performance.now() - t0) / frames;
    expect(perFrame).toBeLessThan(3);
    // Extrema bleiben erhalten: Maximum der Spalten = Maximum der Rohdaten im Fenster
    let rawMax = -Infinity;
    for (let i = from; i < to; i++) rawMax = Math.max(rawMax, rb.at(i).l + rb.at(i).r);
    decimateMinMax((i) => rb.at(i).l + rb.at(i).r, from, to, 1200, out);
    expect(Math.max(...out.max)).toBeCloseTo(rawMax, 3);
  });
});
