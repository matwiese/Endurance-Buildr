import { DEFAULT_CLASSIFIER, type ClassifierConfig } from '../config/classifier-rules.ts';
import { mergeConfig, type AnalysisConfig, type DeepPartial } from '../config/index.ts';
import { G } from '../constants.ts';
import { classifyBlock } from '../detect/classify.ts';
import { computeBlockFeatures } from '../detect/features.ts';
import { findFailedAttempts, segmentBlocks, type Block } from '../detect/segment.ts';
import { detectOnset } from '../onset.ts';
import { computeMetrics } from '../metrics/index.ts';
import type { RepContext, RepEvents } from '../metrics/types.ts';
import { findQuietAdaptive } from '../quiet.ts';
import { addArrays, mean, msToSamples, sd } from '../stats.ts';
import { TEST_TYPE_INFO, type TestFamily, type TestType } from '../testTypes.ts';
import type { AnalysisWarning, ForceTrace } from '../types.ts';
import { weighFromQuiet } from '../weigh.ts';
import {
  buildContactContext,
  buildPushOffContext,
  dominantShare,
  type MassInfo,
  type TraceArrays,
} from './contexts.ts';
import type { RecordingAnalysis, RepResult } from './types.ts';

export interface AnalyzeOptions {
  /** 'auto' (Standard) oder fester Typ */
  mode?: 'auto' | TestType;
  /** Session-Körpermasse (kg) aus dem Wiegen. Fehlt sie, wird sie aus der ersten Ruhephase geschätzt. */
  bodyMassKg?: number;
  externalLoadKg?: number;
  config?: DeepPartial<AnalysisConfig>;
  classifier?: ClassifierConfig;
  /** Nur diesen Bereich analysieren (z. B. manuell markierter Trial) */
  range?: { start: number; end: number };
}

const toF64 = (a: ArrayLike<number>): Float64Array =>
  a instanceof Float64Array ? a : Float64Array.from(a as ArrayLike<number>);

function flattenEvents(ev: RepEvents): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(ev)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (k === 'rebound' && v && typeof v === 'object') {
      const r = v as NonNullable<RepEvents['rebound']>;
      out['reboundContactStart'] = r.contactStart;
      out['reboundTakeoff'] = r.takeoff;
      if (r.landing !== null) out['reboundLanding'] = r.landing;
    }
  }
  return out;
}

const warn = (
  code: string,
  severity: AnalysisWarning['severity'],
  extra: Partial<AnalysisWarning> = {},
): AnalysisWarning => ({
  code,
  severity,
  ...extra,
});

/** Instabilität/Gewichtsabweichung/kurze Ruhe unmittelbar vor dem Onset. */
function preMovementWarnings(
  t: TraceArrays,
  cfg: AnalysisConfig,
  bw: number,
  from: number,
  onset: number,
): AnalysisWarning[] {
  const out: AnalysisWarning[] = [];
  const w = msToSamples(1000, t.hz);
  const a = Math.max(from, onset - w);
  const n = onset - a;
  if (n < msToSamples(100, t.hz)) {
    out.push(warn('no_quiet_before', 'warning', { at: onset }));
    return out;
  }
  if (n < w - 1)
    out.push(warn('short_quiet', 'info', { at: onset, params: { ms: Math.round((n / t.hz) * 1000) } }));
  const s = sd(t.total, a, onset);
  const mu = mean(t.total, a, onset);
  if (s > Math.max(10, 0.03 * bw))
    out.push(warn('unstable_before_movement', 'warning', { at: onset, params: { sdN: +s.toFixed(1) } }));
  if (Math.abs(mu - bw) > cfg.kinematics.weightMismatchRel * bw)
    out.push(
      warn('weight_mismatch', 'warning', {
        at: onset,
        params: { meanN: +mu.toFixed(0), bwN: +bw.toFixed(0) },
      }),
    );
  return out;
}

interface Ctx {
  t: TraceArrays;
  m: MassInfo;
  cfg: AnalysisConfig;
  classifier: ClassifierConfig;
  mode: 'auto' | TestType;
}

function makeRep(
  ctx: RepContext,
  base: Pick<RepResult, 'index' | 'blockIndex' | 'startIdx' | 'endIdx'> & {
    detectedType: RepResult['detectedType'];
    confidence: number | null;
    candidates?: RepResult['candidates'];
  },
  warnings: AnalysisWarning[],
  side: RepResult['side'],
): RepResult {
  return {
    ...base,
    type: ctx.type,
    events: flattenEvents(ctx.ev),
    metrics: computeMetrics(ctx),
    side,
    warnings,
    included: true,
  };
}

function processBlock(
  c: Ctx,
  block: Block,
  repCounter: { n: number },
  quietFrom: number,
): { reps: RepResult[]; warnings: AnalysisWarning[]; occupied: { start: number; end: number } } {
  const r = processBlockInner(c, block, repCounter, quietFrom);
  return {
    ...r,
    occupied: {
      start: block.kind === 'jump' ? (r.onset ?? block.startIdx) : block.startIdx,
      end: block.endIdx,
    },
  };
}

function processBlockInner(
  c: Ctx,
  block: Block,
  repCounter: { n: number },
  quietFrom: number,
): { reps: RepResult[]; warnings: AnalysisWarning[]; onset: number | null } {
  const { t, m, cfg } = c;
  const bw = (m.bodyMass + m.loadKg) * G;
  const reps: RepResult[] = [];
  const warnings: AnalysisWarning[] = [];
  const f0 = block.flights[0];

  // Onset (nur Blöcke, die aus dem Stand beginnen)
  let onset: number | null = null;
  if (block.kind === 'jump' && f0) {
    let quiet;
    if (cfg.onset.method === 'sd5') {
      const q = findQuietAdaptive(t.total, t.hz, cfg.quiet, { bw }, block.from, f0.takeoffIdx).intervals;
      quiet = q[q.length - 1];
    }
    const on = detectOnset(t.total, t.hz, bw, cfg, block.from, f0.takeoffIdx + 1, quiet);
    if (!on) {
      warnings.push(warn('no_onset', 'warning', { at: f0.takeoffIdx }));
      return { reps, warnings, onset: null };
    }
    onset = on.index;
  }

  const features = computeBlockFeatures(t, m, cfg, block, onset);
  const forced = c.mode !== 'auto' ? c.mode : null;
  const cls = forced ? null : classifyBlock(features, cfg.detect.minConfidence, c.classifier);
  const type = (forced ?? cls!.type) as TestType | 'unclear';
  const detectedType = forced ? null : cls!.type;
  const confidence = cls ? cls.confidence : null;
  const preStart = Math.max(quietFrom, (onset ?? block.startIdx) - msToSamples(1000, t.hz));
  const startIdx = block.kind === 'jump' ? preStart : block.startIdx;
  const baseInfo = (index: number) => ({
    index,
    blockIndex: block.index,
    startIdx,
    endIdx: block.endIdx,
    detectedType,
    confidence,
    candidates: cls?.candidates,
  });

  const pre = onset !== null ? preMovementWarnings(t, cfg, bw, block.from, onset) : [];

  if (type === 'unclear') {
    reps.push({
      ...baseInfo(repCounter.n++),
      type: 'unclear',
      events: onset !== null ? { onset } : {},
      metrics: {},
      side: features.singleLeg ? dominantShare(t, startIdx, block.endIdx).side : 'both',
      warnings: [warn('unclear_type', 'warning'), ...pre],
      included: true,
    });
    return { reps, warnings, onset };
  }

  const info = TEST_TYPE_INFO[type];
  const family: TestFamily = info.family;
  const singleLeg = forced ? info.singleLeg : features.singleLeg;
  const side: RepResult['side'] = singleLeg
    ? dominantShare(t, startIdx, f0 ? f0.takeoff : block.endIdx).side
    : 'both';
  const lowConf: AnalysisWarning[] =
    confidence !== null && confidence < 0.75
      ? [warn('low_confidence', 'info', { params: { confidence: +confidence.toFixed(2) } })]
      : [];

  const mismatch = (): { reps: RepResult[]; warnings: AnalysisWarning[]; onset: number | null } => {
    warnings.push(warn('type_mismatch', 'warning', { params: { type, blockKind: block.kind } }));
    return { reps, warnings, onset };
  };

  if (family === 'cmj' || family === 'sj') {
    if (block.kind !== 'jump' || !f0 || onset === null) return mismatch();
    const ctx = buildPushOffContext({ t, m, type, cfg, onset, f1: f0, blockEnd: block.endIdx, singleLeg });
    const w = [...pre, ...lowConf];
    if (block.flights.length > 1)
      w.push(warn('extra_flights', 'info', { params: { flights: block.flights.length } }));
    reps.push(makeRep(ctx, baseInfo(repCounter.n++), w, side));
  } else if (family === 'cmrj') {
    const f1 = block.flights[0];
    const f2 = block.flights[1];
    if (block.kind !== 'jump' || !f1 || !f2 || onset === null) {
      warnings.push(warn('needs_two_flights', 'warning', { params: { flights: block.flights.length } }));
      return { reps, warnings, onset };
    }
    const ctx = buildPushOffContext({ t, m, type, cfg, onset, f1, f2, blockEnd: block.endIdx, singleLeg });
    reps.push(makeRep(ctx, baseInfo(repCounter.n++), [...pre, ...lowConf], side));
  } else if (family === 'dj') {
    if (block.kind !== 'drop' || !block.drop || !f0) return mismatch();
    const ctx = buildContactContext({
      t,
      m,
      type,
      cfg,
      contactStart: block.drop.start,
      startIdx: block.drop.startIdx,
      flight: f0,
      blockEnd: block.endIdx,
      singleLeg,
    });
    const w = [...lowConf];
    if (block.flights.length > 1)
      w.push(warn('extra_flights', 'info', { params: { flights: block.flights.length } }));
    reps.push(makeRep(ctx, baseInfo(repCounter.n++), w, side));
  } else if (family === 'landing') {
    if (block.kind !== 'landing' || !block.drop) return mismatch();
    const ctx = buildContactContext({
      t,
      m,
      type,
      cfg,
      contactStart: block.drop.start,
      startIdx: block.drop.startIdx,
      flight: null,
      blockEnd: block.endIdx,
      singleLeg,
    });
    const w = [...lowConf];
    if (ctx.ev.stabilized === null || ctx.ev.stabilized === undefined)
      w.push(warn('not_stabilized', 'warning'));
    reps.push(makeRep(ctx, baseInfo(repCounter.n++), w, side));
  } else if (family === 'hop') {
    if (block.kind !== 'jump' || onset === null || block.flights.length < 1) return mismatch();
    const hopReps: RepResult[] = [];
    block.flights.forEach((fl, k) => {
      const prev = k > 0 ? block.flights[k - 1]! : null;
      const nxt = block.flights[k + 1] ?? null;
      const contactStart = prev ? prev.landing : onset!;
      const startI = prev ? prev.landingIdx : onset!;
      const ctx = buildContactContext({
        t,
        m,
        type,
        cfg,
        contactStart,
        startIdx: startI,
        flight: fl,
        blockEnd: nxt ? nxt.takeoffIdx : block.endIdx,
        singleLeg,
      });
      const rep = makeRep(
        ctx,
        {
          ...baseInfo(repCounter.n++),
          startIdx: k === 0 ? startIdx : startI,
          endIdx: nxt ? fl.landingIdx : block.endIdx,
        },
        k === 0 ? [...pre, ...lowConf] : [],
        side,
      );
      rep.hopIndex = k + 1;
      hopReps.push(rep);
    });
    markHopSelection(hopReps, cfg);
    reps.push(...hopReps);
  } else {
    warnings.push(warn('not_implemented', 'error', { params: { type } }));
  }
  return { reps, warnings, onset };
}

/** Erster Kontakt aus dem Stand ist nicht repräsentativ; bei > bestN Hops zählen nur die besten bestN (nach Metrik). */
export function markHopSelection(reps: RepResult[], cfg: AnalysisConfig): void {
  if (reps.length === 0) return;
  const contacts = reps
    .slice(1)
    .map((r) => r.metrics['contact_time'])
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);
  const median = contacts.length ? contacts[Math.floor(contacts.length / 2)]! : null;
  const first = reps[0]!;
  const fc = first.metrics['contact_time'];
  if (reps.length > 1 && median !== null && typeof fc === 'number' && fc > 1.5 * median) {
    first.leadIn = true;
    first.included = false;
  }
  const cand = reps.filter((r) => !r.leadIn);
  const n = cfg.hop.bestN;
  if (n > 0 && cand.length > n) {
    const key = cfg.hop.bestMetric;
    const ranked = [...cand].sort((a, b) => (b.metrics[key] ?? -Infinity) - (a.metrics[key] ?? -Infinity));
    const keep = new Set(ranked.slice(0, n));
    for (const r of cand) r.included = keep.has(r);
  }
}

/**
 * Analysiert eine komplette Aufnahme: Segmentierung in Blöcke → Typerkennung (Auto) bzw. fester Typ → Onset, Phasen, Metriken.
 * Reine Funktion (deterministisch). Iso/Balance-Typen siehe analyzeStatic (M3).
 */
export function analyzeRecording(trace: ForceTrace, opts: AnalyzeOptions = {}): RecordingAnalysis {
  const cfg = mergeConfig(opts.config);
  const n = Math.min(trace.left.length, trace.right.length);
  const total = addArrays(trace.left, trace.right);
  const t: TraceArrays = { total, left: toF64(trace.left), right: toF64(trace.right), hz: trace.hz };
  const warnings: AnalysisWarning[] = [];
  const loadKg = opts.externalLoadKg ?? 0;
  const mode = opts.mode ?? 'auto';
  const rangeFrom = Math.max(0, opts.range?.start ?? 0);
  const rangeTo = Math.min(n, opts.range?.end ?? n);

  // Segmente (Pausen/Re-Zero unterbrechen die Integration)
  const cuts = [rangeFrom, ...(trace.breaks ?? []).filter((b) => b > rangeFrom && b < rangeTo), rangeTo];
  const segments: Array<[number, number]> = [];
  for (let i = 0; i + 1 < cuts.length; i++)
    if (cuts[i + 1]! - cuts[i]! > 1) segments.push([cuts[i]!, cuts[i + 1]!]);

  // Körpermasse
  let bodyMass: number | null = opts.bodyMassKg ?? null;
  let massSource: RecordingAnalysis['massSource'] = bodyMass !== null ? 'session' : 'none';
  if (bodyMass === null) {
    for (const [a, b] of segments) {
      const wr = weighFromQuiet(total, t.left, trace.hz, cfg, a, b);
      if (wr) {
        bodyMass = wr.massKg - loadKg;
        massSource = 'quiet';
        warnings.push(warn('weight_estimated', 'info', { params: { kg: +bodyMass.toFixed(1) } }));
        break;
      }
    }
  }
  if (bodyMass === null || !(bodyMass > 0)) {
    warnings.push(warn('no_weight', 'error'));
    return { hz: trace.hz, bodyMassKg: null, massSource: 'none', externalLoadKg: loadKg, reps: [], warnings };
  }
  if (mode === 'auto' && massSource !== 'session') warnings.push(warn('auto_detect_needs_weight', 'warning'));

  const m: MassInfo = { bodyMass, loadKg };
  const bw = (bodyMass + loadKg) * G;
  const c: Ctx = { t, m, cfg, classifier: opts.classifier ?? DEFAULT_CLASSIFIER, mode };
  const reps: RepResult[] = [];
  const counter = { n: 0 };

  if (
    mode !== 'auto' &&
    (TEST_TYPE_INFO[mode].family === 'isometric' || TEST_TYPE_INFO[mode].family === 'balance')
  ) {
    warnings.push(warn('not_implemented', 'error', { params: { type: mode } }));
    return { hz: trace.hz, bodyMassKg: bodyMass, massSource, externalLoadKg: loadKg, reps, warnings };
  }

  for (const [a, b] of segments) {
    const seg = segmentBlocks(total, trace.hz, bw, cfg, a, b);
    const occupied: Array<{ start: number; end: number }> = [];
    for (const blk of seg.blocks) {
      const r = processBlock(c, blk, counter, a);
      reps.push(...r.reps);
      warnings.push(...r.warnings);
      occupied.push(r.occupied);
    }
    for (const att of findFailedAttempts(total, trace.hz, bw, cfg, occupied, a, b))
      warnings.push(warn('failed_attempt', 'info', { at: att.start, params: { endIdx: att.end } }));
    if (!seg.blocks.length) warnings.push(warn('no_movement', 'info', { at: a }));
  }
  return { hz: trace.hz, bodyMassKg: bodyMass, massSource, externalLoadKg: loadKg, reps, warnings };
}
