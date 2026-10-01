import { prepareCop } from '../balance.ts';
import type { AnalysisConfig } from '../config/index.ts';
import { G } from '../constants.ts';
import { detectContractions } from '../iso.ts';
import { computeMetrics } from '../metrics/index.ts';
import type { RepContext } from '../metrics/types.ts';
import { mean, msToSamples } from '../stats.ts';
import { TEST_TYPE_INFO, type TestType } from '../testTypes.ts';
import type { AnalysisWarning, ForceTrace } from '../types.ts';
import { dominantShare, type TraceArrays } from './contexts.ts';
import type { RepResult } from './types.ts';

const warn = (
  code: string,
  severity: AnalysisWarning['severity'],
  extra: Partial<AnalysisWarning> = {},
): AnalysisWarning => ({
  code,
  severity,
  ...extra,
});

/** Isometrie: eine Rep je Kontraktion. `bodyMass` (kg) optional – Gewicht in Testposition für die Netto-Kraft. */
export function analyzeIsometric(
  t: TraceArrays,
  cfg: AnalysisConfig,
  type: TestType,
  bodyMass: number | null,
  from: number,
  to: number,
  counter: { n: number },
): { reps: RepResult[]; warnings: AnalysisWarning[] } {
  const warnings: AnalysisWarning[] = [];
  const baselineN = bodyMass && bodyMass > 0 ? bodyMass * G : undefined;
  const cons = detectContractions(t.total, t.left, t.right, t.hz, cfg, type, baselineN, from, to);
  if (!cons.length) warnings.push(warn('no_contraction', 'warning', { at: from }));
  const reps: RepResult[] = [];
  for (const c of cons) {
    const ctx: RepContext = {
      family: 'isometric',
      type,
      hz: t.hz,
      mass: bodyMass ?? 0,
      bodyMass: bodyMass ?? 0,
      externalLoadKg: 0,
      bw: baselineN ?? c.baseline,
      thresholdN: cfg.flight.thresholdN,
      takeoffCorrection: false,
      total: t.total,
      left: t.left,
      right: t.right,
      kin: null,
      ev: { onset: c.onset, peak: c.peakIdx, windowStart: c.onset, windowEnd: c.end },
      quietLeftShare: 0.5,
      singleLeg: false,
      iso: {
        onset: c.onset,
        peakIdx: c.peakIdx,
        baselineN: c.baseline,
        baseLeft: c.baseLeft,
        baseRight: c.baseRight,
        sign: c.sign,
        end: c.end,
      },
    };
    const w: AnalysisWarning[] = [];
    if (c.sign < 0) w.push(warn('inverted_direction', 'info'));
    if (c.method === 'sd5' && cfg.isoOnset.method === 'yank') w.push(warn('onset_fallback_sd5', 'info'));
    reps.push({
      index: counter.n++,
      blockIndex: reps.length,
      type,
      detectedType: null,
      confidence: null,
      startIdx: Math.max(from, c.onset - msToSamples(1000, t.hz)),
      endIdx: Math.min(to, c.end + msToSamples(500, t.hz)),
      events: { onset: c.onset, peak: c.peakIdx, end: c.end, crossing: c.crossingIdx },
      metrics: computeMetrics(ctx),
      side: 'both',
      warnings: w,
      included: true,
    });
  }
  return { reps, warnings };
}

/** Balance: eine Rep je Aufnahmesegment (erste `trimStartMs` werden verworfen). */
export function analyzeBalance(
  trace: ForceTrace,
  t: TraceArrays,
  cfg: AnalysisConfig,
  type: TestType,
  bodyMass: number | null,
  from: number,
  to: number,
  counter: { n: number },
): { reps: RepResult[]; warnings: AnalysisWarning[] } {
  const warnings: AnalysisWarning[] = [];
  const b = cfg.balance;
  const a0 = from + msToSamples(b.trimStartMs, t.hz);
  if (to - a0 < msToSamples(2000, t.hz)) {
    warnings.push(warn('balance_too_short', 'error', { at: from }));
    return { reps: [], warnings };
  }
  const info = TEST_TYPE_INFO[type];
  const dom = dominantShare(t, a0, to);
  const singleLeg = info.singleLeg || dom.share >= cfg.detect.singleLegShare;
  const side = singleLeg ? dom.side : 'both';
  const cop = prepareCop(trace, a0, to, t.hz, b.copCutoffHz, b.geometry, side);
  const w: AnalysisWarning[] = [];
  if (!cop.hasCop) w.push(warn('no_cop', 'info'));
  if ((to - a0) / t.hz < b.minDurationS)
    w.push(warn('short_balance', 'info', { params: { seconds: +((to - a0) / t.hz).toFixed(1) } }));
  const bw = mean(t.total, a0, to);
  const ctx: RepContext = {
    family: 'balance',
    type,
    hz: t.hz,
    mass: bodyMass ?? bw / G,
    bodyMass: bodyMass ?? bw / G,
    externalLoadKg: 0,
    bw,
    thresholdN: cfg.flight.thresholdN,
    takeoffCorrection: false,
    total: t.total,
    left: t.left,
    right: t.right,
    kin: null,
    ev: { windowStart: a0, windowEnd: to },
    quietLeftShare: 0.5,
    singleLeg,
    balance: { start: a0, end: to, hasCop: cop.hasCop, x: cop.x, y: cop.y, side },
  };
  const rep: RepResult = {
    index: counter.n++,
    blockIndex: 0,
    type,
    detectedType: null,
    confidence: null,
    startIdx: from,
    endIdx: to,
    events: { windowStart: a0, windowEnd: to },
    metrics: computeMetrics(ctx),
    side,
    warnings: w,
    included: true,
  };
  return { reps: [rep], warnings };
}
