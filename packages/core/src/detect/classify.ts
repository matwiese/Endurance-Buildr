import {
  DEFAULT_CLASSIFIER,
  type BaseType,
  type BlockFeatures,
  type ClassifierConfig,
  type RuleCondition,
} from '../config/classifier-rules.ts';
import type { TestType } from '../testTypes.ts';

export interface Classification {
  /** konkreter Typ oder 'unclear' */
  type: TestType | 'unclear';
  baseType: BaseType | null;
  confidence: number;
  /** Score je Regel-ID (nur > 0) */
  scores: Record<string, number>;
  /** Kandidaten absteigend (für die manuelle Auswahl bei „unklar“) */
  candidates: Array<{ type: TestType; score: number }>;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function conditionScore(c: RuleCondition, f: BlockFeatures): number {
  if (c.op === '==') return f[c.feature] === c.value ? 1 : 0;
  const x = f[c.feature];
  const m = Math.max(1e-9, c.margin);
  // 0,5 genau auf der Schwelle, 1 ab Schwelle ± margin in die erfüllte Richtung
  return clamp01(c.op === '>=' ? (x - (c.value - m)) / (2 * m) : (c.value + m - x) / (2 * m));
}

/** Harte Bedingungen gelten scharf (ohne Margin). */
export function conditionHolds(c: RuleCondition, f: BlockFeatures): boolean {
  if (c.op === '==') return f[c.feature] === c.value;
  const x = f[c.feature];
  return c.op === '>=' ? x >= c.value : x <= c.value;
}

export function ruleScore(conds: RuleCondition[], prior: number, f: BlockFeatures): number {
  let wsum = 0;
  let acc = 0;
  for (const c of conds) {
    if (c.hard) {
      if (!conditionHolds(c, f)) return 0;
      continue;
    }
    const s = conditionScore(c, f);
    const w = c.weight ?? 1;
    wsum += w;
    acc += w * s;
  }
  return (wsum > 0 ? acc / wsum : 1) * prior;
}

export function resolveType(base: BaseType, f: BlockFeatures, cfg: ClassifierConfig): TestType {
  const m = cfg.typeMap[base];
  if (f.singleLeg && m.single) return m.single;
  if (f.loaded && m.loaded) return m.loaded;
  return m.double;
}

export function classifyBlock(
  f: BlockFeatures,
  minConfidence: number,
  cfg: ClassifierConfig = DEFAULT_CLASSIFIER,
): Classification {
  const scores: Record<string, number> = {};
  const ranked: Array<{ id: string; base: BaseType; score: number }> = [];
  for (const r of cfg.rules) {
    const s = ruleScore(r.conditions, r.prior ?? 1, f);
    if (s > 0) {
      scores[r.id] = s;
      ranked.push({ id: r.id, base: r.type, score: s });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  const candidates = ranked.map((r) => ({ type: resolveType(r.base, f, cfg), score: r.score }));
  const best = ranked[0];
  if (!best) return { type: 'unclear', baseType: null, confidence: 0, scores, candidates };
  const second = ranked[1]?.score ?? 0;
  const confidence = best.score * (1 - 0.5 * second);
  if (confidence < minConfidence)
    return { type: 'unclear', baseType: best.base, confidence, scores, candidates };
  return { type: resolveType(best.base, f, cfg), baseType: best.base, confidence, scores, candidates };
}
