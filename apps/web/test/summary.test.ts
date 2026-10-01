import { describe, expect, it } from 'vitest';
import { summarize } from '../src/lib/summary.ts';

const rep = (metrics: Record<string, number | null>, extra: Record<string, unknown> = {}) =>
  ({ included: true, metrics, ...extra }) as Parameters<typeof summarize>[0][number];

describe('summarize', () => {
  it('Mittel, SD (n−1) und Beste (höher ist besser)', () => {
    const [s] = summarize(
      [rep({ jump_height_impmom: 30 }), rep({ jump_height_impmom: 32 }), rep({ jump_height_impmom: 34 })],
      ['jump_height_impmom'],
    );
    expect(s!.n).toBe(3);
    expect(s!.mean).toBeCloseTo(32, 9);
    expect(s!.sd).toBeCloseTo(2, 9);
    expect(s!.best).toBe(34);
  });

  it('schließt ausgeschlossene, entfernte und Lead-in-Reps aus', () => {
    const [s] = summarize(
      [
        rep({ jump_height_impmom: 30 }),
        rep({ jump_height_impmom: 99 }, { included: false }),
        rep({ jump_height_impmom: 98 }, { removed: true }),
        rep({ jump_height_impmom: 97 }, { leadIn: true }),
      ],
      ['jump_height_impmom'],
    );
    expect(s).toMatchObject({ n: 1, mean: 30, sd: null, best: 30 });
  });

  it('Asymmetrie: Mittel der Beträge, kein „Beste“', () => {
    const [s] = summarize(
      [rep({ asym_takeoff_peak_force: 4 }), rep({ asym_takeoff_peak_force: -6 })],
      ['asym_takeoff_peak_force'],
    );
    expect(s!.mean).toBe(5);
    expect(s!.best).toBeNull();
  });

  it('fehlende Werte → n = 0', () => {
    const [s] = summarize([rep({ jump_height_impmom: null })], ['jump_height_impmom', 'unknown']);
    expect(s).toMatchObject({ n: 0, mean: null });
  });
});
