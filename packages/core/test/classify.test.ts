import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLASSIFIER,
  classifyBlock,
  conditionScore,
  ruleScore,
  type BlockFeatures,
  type ClassifierConfig,
} from '../src/index.ts';

const base: BlockFeatures = {
  flights: 1,
  startsUnloaded: false,
  cmDepthCm: 30,
  cmVelocity: -1.2,
  firstContactMs: 700,
  maxFollowingContactMs: 0,
  singleLeg: false,
  legShare: 0.52,
  loaded: false,
  endsInHold: false,
};
const f = (o: Partial<BlockFeatures>): BlockFeatures => ({ ...base, ...o });
const cls = (o: Partial<BlockFeatures>, min = 0.55, cfg?: ClassifierConfig) => classifyBlock(f(o), min, cfg);

describe('Auto-Detect-Klassifikator (Regeltabelle in config/classifier-rules.ts)', () => {
  it('typische Merkmalsvektoren je Basistyp', () => {
    expect(cls({}).type).toBe('cmj');
    expect(cls({ cmDepthCm: 1.5, cmVelocity: -0.08 }).type).toBe('sj');
    expect(cls({ flights: 2, firstContactMs: 800, maxFollowingContactMs: 250 }).type).toBe('cmrj');
    expect(
      cls({ flights: 8, cmDepthCm: 4, cmVelocity: -0.3, firstContactMs: 350, maxFollowingContactMs: 210 })
        .type,
    ).toBe('hop');
    expect(cls({ startsUnloaded: true, firstContactMs: 220, cmDepthCm: 0, cmVelocity: 0 }).type).toBe('dj');
    expect(
      cls({
        startsUnloaded: true,
        flights: 0,
        firstContactMs: 0,
        cmDepthCm: 0,
        cmVelocity: 0,
        endsInHold: true,
      }).type,
    ).toBe('land_hold');
  });

  it('Merkmale werden zu Einbein-/Last-Varianten abgebildet (typeMap)', () => {
    expect(cls({ singleLeg: true }).type).toBe('sl_jump');
    expect(cls({ loaded: true }).type).toBe('loaded_cmj');
    expect(cls({ loaded: true, cmDepthCm: 1, cmVelocity: 0 }).type).toBe('loaded_sj');
    expect(cls({ singleLeg: true, flights: 2, firstContactMs: 800, maxFollowingContactMs: 250 }).type).toBe(
      'sl_cmrj',
    );
    expect(
      cls({
        singleLeg: true,
        flights: 8,
        cmDepthCm: 3,
        cmVelocity: -0.2,
        firstContactMs: 300,
        maxFollowingContactMs: 210,
      }).type,
    ).toBe('sl_hop');
    expect(
      cls({ singleLeg: true, startsUnloaded: true, firstContactMs: 200, cmDepthCm: 0, cmVelocity: 0 }).type,
    ).toBe('sl_dj');
    expect(
      cls({
        singleLeg: true,
        startsUnloaded: true,
        flights: 0,
        firstContactMs: 0,
        cmDepthCm: 0,
        cmVelocity: 0,
        endsInHold: true,
      }).type,
    ).toBe('sl_land_hold');
    // Zwei einbeinige Flüge mit kurzem, flachem ersten Kontakt = Hop and Return
    expect(
      cls({
        singleLeg: true,
        flights: 2,
        cmDepthCm: 3,
        cmVelocity: -0.2,
        firstContactMs: 380,
        maxFollowingContactMs: 220,
      }).type,
    ).toBe('sl_hop_return');
  });

  it('Grenzfälle liefern „unklar“ mit Kandidatenliste und niedriger Konfidenz', () => {
    const r = cls({ cmDepthCm: 8, cmVelocity: -0.4 });
    expect(r.type).toBe('unclear');
    expect(r.confidence).toBeLessThan(0.55);
    expect(r.candidates.map((c) => c.type)).toEqual(expect.arrayContaining(['cmj', 'sj']));
    expect(r.candidates[0]!.score).toBeGreaterThanOrEqual(r.candidates[1]!.score);
    // keine Regel passt (Drop mit zwei Flügen)
    const none = cls({ startsUnloaded: true, flights: 3 });
    expect(none.type).toBe('unclear');
    expect(none.confidence).toBeLessThan(0.55);
  });

  it('Konfidenz steigt mit dem Abstand zur Entscheidungsgrenze und fällt bei Konkurrenz', () => {
    const c = (d: number) => cls({ cmDepthCm: d, cmVelocity: -d / 25 }).confidence;
    expect(c(30)).toBeGreaterThan(c(12));
    expect(c(12)).toBeGreaterThan(c(9));
    const sj = (d: number) => cls({ cmDepthCm: d, cmVelocity: -d / 25 });
    expect(sj(1).type).toBe('sj');
    expect(sj(1).confidence).toBeGreaterThan(sj(5).confidence);
  });

  it('Schwelle `minConfidence` ist einstellbar: strenger ⇒ mehr „unklar“', () => {
    const feats = { cmDepthCm: 12, cmVelocity: -0.5 };
    expect(cls(feats, 0.5).type).toBe('cmj');
    expect(cls(feats, 0.99).type).toBe('unclear');
  });

  it('Regeln sind konfigurierbar: eigene Regeldatei verändert das Ergebnis ohne Codeänderung', () => {
    const strictCmj: ClassifierConfig = {
      ...DEFAULT_CLASSIFIER,
      rules: DEFAULT_CLASSIFIER.rules.map((r) =>
        r.id === 'cmj'
          ? {
              ...r,
              conditions: r.conditions.map((c) =>
                c.feature === 'cmDepthCm' && c.op === '>=' ? { ...c, value: 40, margin: 5 } : c,
              ),
            }
          : r,
      ),
    };
    expect(cls({ cmDepthCm: 30 }).type).toBe('cmj');
    expect(cls({ cmDepthCm: 30 }, 0.55, strictCmj).type).not.toBe('cmj');
    // Typ-Abbildung ersetzen
    const renamed: ClassifierConfig = {
      ...DEFAULT_CLASSIFIER,
      typeMap: { ...DEFAULT_CLASSIFIER.typeMap, cmj: { double: 'abalakov' } },
    };
    expect(cls({}, 0.55, renamed).type).toBe('abalakov');
  });

  it('Bedingungs-Scores: 0,5 auf der Schwelle, 1 bzw. 0 jenseits der Marge; harte Bedingungen sind scharf', () => {
    const cond = { feature: 'cmDepthCm', op: '>=', value: 10, margin: 4 } as const;
    expect(conditionScore(cond, f({ cmDepthCm: 10 }))).toBeCloseTo(0.5, 9);
    expect(conditionScore(cond, f({ cmDepthCm: 14 }))).toBe(1);
    expect(conditionScore(cond, f({ cmDepthCm: 6 }))).toBe(0);
    expect(
      ruleScore([{ feature: 'flights', op: '>=', value: 2, margin: 0.4, hard: true }], 1, f({ flights: 1 })),
    ).toBe(0);
    expect(
      ruleScore(
        [{ feature: 'singleLeg', op: '==', value: true, hard: true }, cond],
        1,
        f({ singleLeg: true, cmDepthCm: 14 }),
      ),
    ).toBe(1);
  });

  it('Abalakov/Isometrie/Balance sind nicht auto-erkennbar (nur manuell setzbar)', async () => {
    const { TEST_TYPE_INFO } = await import('../src/index.ts');
    for (const t of [
      'abalakov',
      'isometric',
      'imtp',
      'iso_squat',
      'shoulder_iso_i',
      'quiet_stand',
      'sl_stand',
      'sl_range_of_stability',
    ] as const)
      expect(TEST_TYPE_INFO[t].autoDetectable, t).toBe(false);
    for (const t of ['cmj', 'sj', 'cmrj', 'dj', 'hop', 'sl_jump', 'land_hold'] as const)
      expect(TEST_TYPE_INFO[t].autoDetectable, t).toBe(true);
  });
});
