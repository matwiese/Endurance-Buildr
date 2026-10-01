import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  G,
  addArrays,
  analyzeRecording,
  integrateKinematics,
  interpAt,
  parseForceTraceCsv,
  posAt,
  type ParsedTraceFile,
} from '../src/index.ts';

/**
 * Regression gegen die realen Referenz-Exporte (/reference). Die Referenz-App liefert Post-Analyse-Spalten
 * (Acceleration/Velocity/Height/Power/Impulse); daraus werden Onset, Kinematik und Plausibilitäten geprüft.
 */
const CASES = [
  { file: 'cmj_trial1', type: 'cmj', side: 'both', hz: 500, weight: 88.77, onset: 471, rows: 1626 },
  { file: 'sj_trial3', type: 'sj', side: 'both', hz: 1000, weight: 90.49, onset: 1069, rows: 3301 },
  {
    file: 'sl_jump_left_trial4',
    type: 'sl_jump',
    side: 'left',
    hz: 1000,
    weight: 90.34,
    onset: 925,
    rows: 3064,
  },
  {
    file: 'sl_jump_right_trial1',
    type: 'sl_jump',
    side: 'right',
    hz: 1000,
    weight: 90.34,
    onset: 1420,
    rows: 3649,
  },
] as const;

const load = (n: string): ParsedTraceFile =>
  parseForceTraceCsv(
    readFileSync(new URL(`../../../reference/forcedecks_${n}.csv`, import.meta.url), 'utf8'),
  );

describe.each(CASES)('Referenz $file', (c) => {
  const p = load(c.file);
  const ref = p.reference!;
  const total = addArrays(p.trace.left, p.trace.right);
  const bw = p.weightKg! * G;

  it('parst Kopf, Dezimalkomma und Analyse-Spalten', () => {
    expect(p.trace.hz).toBe(c.hz);
    expect(p.weightKg).toBe(c.weight);
    expect(p.trace.left.length).toBe(c.rows);
    expect(ref.onsetIdx).toBe(c.onset);
    expect(p.startTimeS).toBeGreaterThan(0);
  });

  it('Kinematik reproduziert Velocity/Height/Impulse der Referenz (Rundungsfehler)', () => {
    const k = integrateKinematics(total, p.trace.hz, ref.onsetIdx!, total.length, bw, p.weightKg!);
    let ev = 0;
    let es = 0;
    let ei = 0;
    let ea = 0;
    for (let i = 0; i < k.vel.length; i++) {
      const g = ref.onsetIdx! + i;
      ev = Math.max(ev, Math.abs(k.vel[i]! - ref.velocity[g]!));
      es = Math.max(es, Math.abs(k.pos[i]! - ref.height[g]!));
      ei = Math.max(ei, Math.abs(k.impulse[i]! - ref.impulse[g]!));
      ea = Math.max(ea, Math.abs(k.acc[i]! - ref.acceleration[g]!));
    }
    expect(ea).toBeLessThan(1e-5);
    expect(ev).toBeLessThan(1e-4);
    expect(es).toBeLessThan(1e-4);
    expect(ei).toBeLessThan(1e-3);
  });

  it('Power der Referenz ist |F·v|', () => {
    const k = integrateKinematics(total, p.trace.hz, ref.onsetIdx!, total.length, bw, p.weightKg!);
    for (let i = 1; i < k.vel.length; i += 7) {
      const g = ref.onsetIdx! + i;
      expect(Math.abs(Math.abs(total[g]! * k.vel[i]!) - ref.power[g]!)).toBeLessThan(0.1);
    }
  });

  const r = analyzeRecording(p.trace, { bodyMassKg: p.weightKg });
  const rep = r.reps[0]!;

  it('Auto-Detect: genau eine Rep mit richtigem Typ, hoher Konfidenz und Seite', () => {
    expect(r.reps).toHaveLength(1);
    expect(rep.detectedType).toBe(c.type);
    expect(rep.type).toBe(c.type);
    expect(rep.confidence).toBeGreaterThan(0.75);
    expect(rep.side).toBe(c.side);
  });

  it('Onset-Index ist identisch mit der Referenz-App', () => {
    expect(rep.events['onset']).toBe(c.onset);
  });

  it('Takeoff/Landung liegen an den 20-N-Kanten und Flugzeit stimmt mit der Samplezahl überein', () => {
    const lo: number[] = [];
    for (let i = 0; i < total.length; i++) if (total[i]! < 20) lo.push(i);
    const first = lo[0]!;
    const tk = rep.events['takeoff']!;
    expect(tk).toBeGreaterThanOrEqual(first - 1);
    expect(tk).toBeLessThanOrEqual(first);
    const ft = rep.metrics['flight_time']!;
    // zusammenhängender Lauf ab `first`
    let end = first;
    while (end + 1 < total.length && total[end + 1]! < 20) end++;
    expect(Math.abs(ft - (end - first + 1) / p.trace.hz)).toBeLessThan(0.0016);
  });

  it('Abhebegeschwindigkeit: ohne Korrektur = Referenz-Velocity am Takeoff; mit Korrektur ≤ Referenz (g·ε, ≤ 3 ms)', () => {
    const tk = rep.events['takeoff']!;
    const vRef = interpAt(ref.velocity, tk);
    const raw = analyzeRecording(p.trace, {
      bodyMassKg: p.weightKg,
      config: { kinematics: { takeoffCorrection: false } },
    }).reps[0]!;
    expect(Math.abs(raw.metrics['takeoff_velocity']! - vRef)).toBeLessThan(0.006);
    const v = rep.metrics['takeoff_velocity']!;
    expect(v).toBeLessThanOrEqual(vRef + 1e-9);
    expect(vRef - v).toBeLessThan(0.03);
  });

  it('Sprunghöhen: Imp-Mom und Flugzeit weichen < 3 cm voneinander ab, Tiefe = Referenz-Height bei v = 0', () => {
    const m = rep.metrics;
    expect(Math.abs(m['jump_height_impmom']! - m['jump_height_flight']!)).toBeLessThan(3);
    expect(m['jump_height_impmom']!).toBeGreaterThan(20);
    expect(m['jump_height_impmom']!).toBeLessThan(55);
    if (c.type !== 'sj') {
      const zv = rep.events['zeroVel']!;
      expect(Math.abs(m['countermovement_depth']! / 100 - interpAt(ref.height, zv))).toBeLessThan(0.0006);
      expect(m['countermovement_depth']!).toBeLessThan(-15);
    }
  });

  it('Spitzenleistung = Maximum von |F·v| der Referenz in der konzentrischen Phase', () => {
    const zv = Math.ceil(rep.events['zeroVel']!);
    const tk = Math.floor(rep.events['takeoff']!);
    let mx = 0;
    for (let i = zv; i <= tk; i++) mx = Math.max(mx, ref.power[i]!);
    expect(Math.abs(rep.metrics['peak_power']! - mx) / mx).toBeLessThan(0.002);
  });

  it('Konzentrischer Impuls = m·v_TO (Impuls-Momentum-Invariante)', () => {
    const m = rep.metrics;
    expect(Math.abs(m['concentric_impulse']! - p.weightKg! * m['takeoff_velocity']!)).toBeLessThan(
      0.01 * p.weightKg! * m['takeoff_velocity']!,
    );
  });

  it('Einbeinige Tests liefern keine L/R-Asymmetrie, beidbeinige schon', () => {
    if (c.side === 'both') expect(rep.metrics['asym_concentric_mean_force']).not.toBeNull();
    else expect(rep.metrics['asym_concentric_mean_force']).toBeNull();
  });

  it('COM-Position bei Takeoff ist endlich', () => {
    const k = integrateKinematics(total, p.trace.hz, ref.onsetIdx!, total.length, bw, p.weightKg!);
    expect(Number.isFinite(posAt(k, rep.events['takeoff']!))).toBe(true);
  });
});
