import { describe, expect, it } from 'vitest';
import { computeLeaderboard, type LeaderboardOptions } from '../src/index.ts';

let n = 0;
const rep = (v: number | null, over: Record<string, unknown> = {}) => ({
  index: n++,
  included: true,
  leadIn: false,
  metrics: { h: v, asym: v },
  ...over,
});
const test = (profileId: string | null, vals: Array<number | null>, over: Record<string, unknown> = {}) => ({
  id: `t${n++}`,
  profileId,
  testType: 'cmj',
  createdAt: `2026-10-01T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
  reps: vals.map((v) => rep(v)),
  ...over,
});
const opts = (o: Partial<LeaderboardOptions> = {}): LeaderboardOptions => ({
  testType: 'cmj',
  metric: 'h',
  aggregate: 'best',
  higherIsBetter: true,
  ...o,
});

describe('Rangliste', () => {
  it('sortiert nach bestem Wert, gleiche Werte teilen sich den Platz (1,2,2,4), ohne Messung hinten', () => {
    const rows = computeLeaderboard(
      [test('a', [30, 35]), test('b', [40]), test('c', [35]), test('d', [20])],
      ['a', 'b', 'c', 'd', 'e'],
      opts(),
    );
    expect(rows.map((r) => [r.profileId, r.value, r.rank])).toEqual([
      ['b', 40, 1],
      ['a', 35, 2],
      ['c', 35, 2],
      ['d', 20, 4],
      ['e', null, null],
    ]);
    expect(rows[3]!.gap).toBe(20);
    expect(rows[0]!.gap).toBe(0);
  });

  it('niedriger ist besser (z. B. Bodenkontaktzeit) und Umkehr', () => {
    const t = [test('a', [0.3]), test('b', [0.2])];
    expect(
      computeLeaderboard(t, ['a', 'b'], opts({ higherIsBetter: false })).map((r) => r.profileId),
    ).toEqual(['b', 'a']);
    expect(
      computeLeaderboard(t, ['a', 'b'], opts({ higherIsBetter: false, invert: true })).map(
        (r) => r.profileId,
      ),
    ).toEqual(['a', 'b']);
  });

  it('Aggregat: Bester, Letzter (chronologisch über mehrere Tests), Mittel', () => {
    const t = [
      test('a', [30, 40], { createdAt: '2026-10-01T10:00:00.000Z' }),
      test('a', [25], { createdAt: '2026-10-01T10:05:00.000Z' }),
    ];
    const by = (aggregate: LeaderboardOptions['aggregate']) =>
      computeLeaderboard(t, ['a'], opts({ aggregate }))[0]!;
    expect(by('best').value).toBe(40);
    expect(by('last').value).toBe(25);
    expect(by('mean').value).toBeCloseTo(31.6667, 3);
    expect(by('best')).toMatchObject({ n: 3, tests: 2, best: 40, last: 25 });
  });

  it('ignoriert ausgeschlossene Reps, Lead-in, fremde Testtypen, Gäste und Athleten außerhalb der Liste', () => {
    const t = [
      { ...test('a', []), reps: [rep(99, { included: false }), rep(98, { leadIn: true }), rep(30)] },
      test('a', [50], { testType: 'sj' }),
      test(null, [60]),
      test('zzz', [70]),
      test('b', [null]),
    ];
    const rows = computeLeaderboard(t, ['a', 'b'], opts());
    expect(rows.map((r) => [r.profileId, r.value])).toEqual([
      ['a', 30],
      ['b', null],
    ]);
  });

  it('Asymmetrie: Betrag, kleiner ist besser', () => {
    const rows = computeLeaderboard(
      [test('a', [-8]), test('b', [3]), test('c', [-1])],
      ['a', 'b', 'c'],
      opts({ metric: 'asym', asymmetry: true }),
    );
    expect(rows.map((r) => [r.profileId, r.value])).toEqual([
      ['c', 1],
      ['b', 3],
      ['a', 8],
    ]);
  });
});
