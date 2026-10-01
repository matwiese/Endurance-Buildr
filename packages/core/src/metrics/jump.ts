import { G } from '../constants.ts';
import { asymmetryPct, maxRange, meanRange, minRange } from '../numerics.ts';
import { defineMetric } from './registry.ts';
import {
  cmOnly,
  flightHeightM,
  forceAt,
  heightFromVelocity,
  jumpEv,
  kin,
  maxRfd,
  must,
  netImpulse,
  peakIn,
  plateImpulse,
  posCm,
  sec,
  takeoffVelocity,
} from './helpers.ts';
import type { RepContext } from './types.ts';

/** Abdruck-Sprünge aus dem Stand */
const PUSH = ['cmj', 'sj', 'cmrj'] as const;
/** inkl. Drop Jump (Kontakt mit ballistisch verankerter Anfangsgeschwindigkeit) */
const PUSH_DJ = ['cmj', 'sj', 'cmrj', 'dj'] as const;
/** mit Gegenbewegung / exzentrischer Phase */
const CM = ['cmj', 'cmrj'] as const;
const CM_DJ = ['cmj', 'cmrj', 'dj'] as const;
/** Familien mit Landung nach Flug (Hop-Kontakte inklusive) bzw. Landung als Hauptereignis */
const LAND = ['cmj', 'sj', 'cmrj', 'dj', 'hop', 'landing'] as const;
const EVERY = ['cmj', 'sj', 'cmrj', 'dj', 'hop', 'landing'] as const;

// ───────────────────────────── Allgemein / Flug ─────────────────────────────
defineMetric({
  key: 'body_weight',
  label: { de: 'Körpergewicht (System)', en: 'Body Weight (system)' },
  unit: 'N',
  phase: 'overall',
  description: {
    de: 'Gewichtskraft des Systems (Körper + externe Last) aus dem Wiegen.',
    en: 'Weight force of the system (body + external load) from weighing.',
  },
  formula: 'BW = (m_Körper + m_Last) · g,  g = 9,80665 m/s²',
  families: [...EVERY],
  compute: (c) => c.bw,
});

defineMetric({
  key: 'jump_height_impmom',
  label: { de: 'Sprunghöhe (Imp-Mom)', en: 'Jump Height (Imp-Mom)' },
  unit: 'cm',
  phase: 'overall',
  higherIsBetter: true,
  description: {
    de: 'Standard-Sprunghöhe aus der Abheb-Geschwindigkeit (Impuls-Momentum-Methode).',
    en: 'Standard jump height from take-off velocity (impulse-momentum method).',
  },
  formula: 'h = v_TO² / (2g),  v_TO = ∫(F − BW)/m dt von Onset bis Takeoff (Trapezregel, v(Onset)=0)',
  families: [...PUSH],
  compute: (c) => {
    const v = takeoffVelocity(c);
    return v > 0 ? heightFromVelocity(v) * 100 : null;
  },
});

defineMetric({
  key: 'jump_height_flight',
  label: { de: 'Sprunghöhe (Flugzeit)', en: 'Jump Height (Flight Time)' },
  unit: 'cm',
  phase: 'flight',
  higherIsBetter: true,
  description: {
    de: 'Sprunghöhe aus der Flugzeit unter Annahme gleicher Abheb- und Landehöhe.',
    en: 'Jump height from flight time assuming equal take-off and landing height.',
  },
  formula: 'h = g · t_Flug² / 8',
  families: [...PUSH_DJ, 'hop'],
  compute: (c) => flightHeightM(c) * 100,
});

defineMetric({
  key: 'jump_height_impdis',
  label: { de: 'Sprunghöhe (Imp-Dis)', en: 'Jump Height (Imp-Dis)' },
  unit: 'cm',
  phase: 'overall',
  higherIsBetter: true,
  description: {
    de: 'Maximale COM-Höhe über der Ausgangsposition: Verschiebung bei Takeoff plus ballistischer Anteil.',
    en: 'Peak COM height above the starting position: displacement at take-off plus ballistic part.',
  },
  formula: 's_TO + v_TO² / (2g),  s_TO = ∫v dt von Onset bis Takeoff',
  families: [...CM],
  compute: (c) => {
    const e = jumpEv(c);
    const v = takeoffVelocity(c);
    return v > 0 ? posCm(c, e.takeoff) + heightFromVelocity(v) * 100 : null;
  },
});

defineMetric({
  key: 'takeoff_velocity',
  label: { de: 'Abhebegeschwindigkeit', en: 'Take-off Velocity' },
  unit: 'm/s',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Geschwindigkeit des Körperschwerpunkts beim Abheben.',
    en: 'COM velocity at take-off.',
  },
  formula: 'v_TO = v(t_Takeoff)',
  families: [...PUSH],
  compute: (c) => takeoffVelocity(c),
});

defineMetric({
  key: 'flight_time',
  label: { de: 'Flugzeit', en: 'Flight Time' },
  unit: 's',
  phase: 'flight',
  higherIsBetter: true,
  description: {
    de: 'Dauer zwischen Abheben und Landung (Kraft < 20 N, linear interpolierte Schwellenkreuzung).',
    en: 'Duration between take-off and landing (force < 20 N, linearly interpolated threshold crossing).',
  },
  formula: 't_Flug = t_Landung − t_Takeoff',
  families: [...PUSH_DJ, 'hop'],
  compute: (c) => {
    const e = jumpEv(c);
    return sec(c, e.takeoff, must(e.landing));
  },
});

// ───────────────────────────── Zeiten ─────────────────────────────
defineMetric({
  key: 'contraction_time',
  label: { de: 'Kontraktionszeit', en: 'Contraction Time' },
  unit: 's',
  phase: 'overall',
  description: {
    de: 'Dauer von Bewegungsbeginn bis Abheben.',
    en: 'Duration from movement onset to take-off.',
  },
  formula: 't_Kontraktion = t_Takeoff − t_Onset',
  families: [...PUSH],
  compute: (c) => {
    const e = jumpEv(c);
    return sec(c, e.onset, e.takeoff);
  },
});

defineMetric({
  key: 'eccentric_duration',
  label: { de: 'Exzentrische Dauer', en: 'Eccentric Duration' },
  unit: 's',
  phase: 'eccentric',
  description: {
    de: 'Dauer von Bewegungsbeginn bis Geschwindigkeits-Nulldurchgang (tiefster Punkt).',
    en: 'Duration from movement onset to zero velocity (lowest point).',
  },
  formula: 't_exz = t(v=0) − t_Onset',
  families: [...CM_DJ],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    return sec(c, e.onset, e.zeroVel);
  },
});

defineMetric({
  key: 'concentric_duration',
  label: { de: 'Konzentrische Dauer', en: 'Concentric Duration' },
  unit: 's',
  phase: 'concentric',
  description: { de: 'Dauer von v = 0 bis Abheben.', en: 'Duration from v = 0 to take-off.' },
  formula: 't_konz = t_Takeoff − t(v=0)',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return sec(c, e.zeroVel, e.takeoff);
  },
});

defineMetric({
  key: 'unweighting_duration',
  label: { de: 'Entlastungsdauer', en: 'Unweighting Duration' },
  unit: 's',
  phase: 'unweighting',
  description: {
    de: 'Dauer von Bewegungsbeginn bis zur maximalen Abwärtsgeschwindigkeit.',
    en: 'Duration from movement onset to peak downward velocity.',
  },
  formula: 't_Entl = t(v_min) − t_Onset',
  families: [...CM],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    return sec(c, e.onset, must(e.vMin));
  },
});

defineMetric({
  key: 'eccentric_decel_duration',
  label: { de: 'Exzentrische Bremsdauer', en: 'Eccentric Deceleration Duration' },
  unit: 's',
  phase: 'braking',
  description: {
    de: 'Dauer von maximaler Abwärtsgeschwindigkeit bis v = 0.',
    en: 'Duration from peak downward velocity to v = 0.',
  },
  formula: 't_Brems = t(v=0) − t(v_min)',
  families: [...CM],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    return sec(c, must(e.vMin), e.zeroVel);
  },
});

defineMetric({
  key: 'rsi_modified',
  label: { de: 'RSI-modified', en: 'RSI-modified' },
  unit: 'm/s',
  phase: 'overall',
  higherIsBetter: true,
  description: {
    de: 'Reaktivkraft-Index (modifiziert): Sprunghöhe (Flugzeit) / Kontraktionszeit.',
    en: 'Modified reactive strength index: jump height (flight time) / contraction time.',
  },
  formula: 'RSI_mod = h_Flug / t_Kontraktion',
  families: [...PUSH],
  compute: (c) => {
    const e = jumpEv(c);
    return flightHeightM(c) / sec(c, e.onset, e.takeoff);
  },
});

// ───────────────────────────── Konzentrisch ─────────────────────────────
defineMetric({
  key: 'concentric_impulse',
  label: { de: 'Konzentrischer Impuls', en: 'Concentric Impulse' },
  unit: 'N·s',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Netto-Impuls (über Körpergewicht) in der konzentrischen Phase; entspricht m·v_TO.',
    en: 'Net impulse (above body weight) in the concentric phase; equals m·v_TO.',
  },
  formula: 'J_konz = ∫(F − BW) dt von v=0 bis Takeoff',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return netImpulse(c, e.zeroVel, e.takeoff);
  },
});

defineMetric({
  key: 'concentric_impulse_rel',
  label: { de: 'Konzentrischer Impuls (rel.)', en: 'Concentric Impulse (rel.)' },
  unit: 'N·s/kg',
  quantity: 'velocity',
  phase: 'concentric',
  decimals: 2,
  higherIsBetter: true,
  description: {
    de: 'Konzentrischer Netto-Impuls bezogen auf die Körpermasse.',
    en: 'Concentric net impulse relative to body mass.',
  },
  formula: 'J_konz / m_Körper',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return netImpulse(c, e.zeroVel, e.takeoff) / c.bodyMass;
  },
});

defineMetric({
  key: 'concentric_impulse_100ms',
  label: { de: 'Konzentrischer Impuls (erste 100 ms)', en: 'Concentric Impulse (first 100 ms)' },
  unit: 'N·s',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Netto-Impuls in den ersten 100 ms der konzentrischen Phase.',
    en: 'Net impulse during the first 100 ms of the concentric phase.',
  },
  formula: 'J_100 = ∫(F − BW) dt über [t(v=0), t(v=0) + 100 ms]',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    const end = e.zeroVel + 0.1 * c.hz;
    if (end > e.takeoff) return null;
    return netImpulse(c, e.zeroVel, end);
  },
});

defineMetric({
  key: 'concentric_peak_force',
  label: { de: 'Konzentrische Spitzenkraft', en: 'Concentric Peak Force' },
  unit: 'N',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Maximale Gesamtkraft in der konzentrischen Phase.',
    en: 'Maximum total force during the concentric phase.',
  },
  formula: 'max F(t), t ∈ [t(v=0), t_Takeoff]',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return maxRange(c.total, e.zeroVel, e.takeoff).value;
  },
});

defineMetric({
  key: 'takeoff_peak_force',
  label: { de: 'Takeoff-Spitzenkraft', en: 'Takeoff Peak Force' },
  unit: 'N',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Spitzenkraft der Abdruckphase (entspricht der konzentrischen Spitzenkraft; separat für die Asymmetrie).',
    en: 'Peak force of the push-off phase (equals concentric peak force; separate for asymmetry).',
  },
  formula: 'max F(t), t ∈ [t(v=0), t_Takeoff]',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return maxRange(c.total, e.zeroVel, e.takeoff).value;
  },
});

defineMetric({
  key: 'concentric_mean_force',
  label: { de: 'Konzentrische Mittelkraft', en: 'Concentric Mean Force' },
  unit: 'N',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Zeitlicher Mittelwert der Gesamtkraft in der konzentrischen Phase.',
    en: 'Time-averaged total force during the concentric phase.',
  },
  formula: '(1/T) ∫F dt über [t(v=0), t_Takeoff]',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return meanRange(c.total, e.zeroVel, e.takeoff);
  },
});

defineMetric({
  key: 'concentric_peak_velocity',
  label: { de: 'Konzentrische Spitzengeschwindigkeit', en: 'Concentric Peak Velocity' },
  unit: 'm/s',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Maximale Aufwärtsgeschwindigkeit des COM vor dem Abheben.',
    en: 'Maximum upward COM velocity before take-off.',
  },
  formula: 'max v(t), t ∈ [t(v=0), t_Takeoff]',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    const k = kin(c);
    return maxRange(k.vel, e.zeroVel - k.i0, e.takeoff - k.i0).value;
  },
});

function concentricPower(c: RepContext): { peak: number; mean: number } {
  const e = jumpEv(c);
  const k = kin(c);
  const i0 = Math.ceil(e.zeroVel);
  const i1 = Math.floor(e.takeoff);
  if (i1 < i0) throw new Error('leere konzentrische Phase');
  let peak = -Infinity;
  let sum = 0;
  for (let i = i0; i <= i1; i++) {
    const p = c.total[i]! * k.vel[i - k.i0]!;
    if (p > peak) peak = p;
    sum += p;
  }
  return { peak, mean: sum / (i1 - i0 + 1) };
}

defineMetric({
  key: 'peak_power',
  label: { de: 'Spitzenleistung', en: 'Peak Power' },
  unit: 'W',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Maximale Leistung P = F·v in der konzentrischen Phase.',
    en: 'Maximum power P = F·v during the concentric phase.',
  },
  formula: 'P(t) = F(t) · v(t);  max P(t), t ∈ [t(v=0), t_Takeoff]',
  families: [...PUSH_DJ],
  compute: (c) => concentricPower(c).peak,
});

defineMetric({
  key: 'peak_power_rel',
  label: { de: 'Spitzenleistung / KM', en: 'Peak Power / BM' },
  unit: 'W/kg',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Spitzenleistung bezogen auf die Körpermasse.',
    en: 'Peak power relative to body mass.',
  },
  formula: 'P_max / m_Körper',
  families: [...PUSH_DJ],
  compute: (c) => concentricPower(c).peak / c.bodyMass,
});

defineMetric({
  key: 'concentric_mean_power',
  label: { de: 'Konzentrische Mittelleistung', en: 'Concentric Mean Power' },
  unit: 'W',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Mittelwert von F·v über die konzentrische Phase.',
    en: 'Mean of F·v over the concentric phase.',
  },
  formula: 'mean(F(t) · v(t)), t ∈ [t(v=0), t_Takeoff]',
  families: [...PUSH_DJ],
  compute: (c) => concentricPower(c).mean,
});

defineMetric({
  key: 'concentric_rfd',
  label: { de: 'Konzentrische RFD (Mittel)', en: 'Concentric RFD (mean)' },
  unit: 'N/s',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Mittlere Kraftanstiegsrate von v = 0 bis zur konzentrischen Spitzenkraft.',
    en: 'Average rate of force development from v = 0 to concentric peak force.',
  },
  formula: '(F_peak − F(v=0)) / (t_peak − t(v=0))',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    const pk = maxRange(c.total, e.zeroVel, e.takeoff);
    if (pk.index - e.zeroVel < 2) return null;
    return (pk.value - forceAt(c, e.zeroVel)) / sec(c, e.zeroVel, pk.index);
  },
});

defineMetric({
  key: 'concentric_rfd_max',
  label: { de: 'Konzentrische Max-RFD (50 ms)', en: 'Concentric Max RFD (50 ms)' },
  unit: 'N/s',
  phase: 'concentric',
  higherIsBetter: true,
  description: {
    de: 'Größter Kraftanstieg in einem 50-ms-Fenster innerhalb der konzentrischen Phase.',
    en: 'Largest force rise within a 50 ms window inside the concentric phase.',
  },
  formula: 'max_t [F(t + 50 ms) − F(t)] / 0,05 s',
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return maxRfd(c, e.zeroVel, e.takeoff, 50);
  },
});

// ───────────────────────────── Exzentrisch / Gegenbewegung ─────────────────────────────
defineMetric({
  key: 'eccentric_mean_force',
  label: { de: 'Exzentrische Mittelkraft', en: 'Eccentric Mean Force' },
  unit: 'N',
  phase: 'eccentric',
  description: { de: 'Mittelkraft von Bewegungsbeginn bis v = 0.', en: 'Mean force from onset to v = 0.' },
  formula: '(1/T) ∫F dt über [t_Onset, t(v=0)]',
  families: [...CM_DJ],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    return meanRange(c.total, e.onset, e.zeroVel);
  },
});

defineMetric({
  key: 'eccentric_peak_force',
  label: { de: 'Exzentrische Spitzenkraft', en: 'Eccentric Peak Force' },
  unit: 'N',
  phase: 'eccentric',
  description: {
    de: 'Maximale Kraft zwischen Bewegungsbeginn und v = 0.',
    en: 'Maximum force between onset and v = 0.',
  },
  formula: 'max F(t), t ∈ [t_Onset, t(v=0)]',
  families: [...CM_DJ],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    return maxRange(c.total, e.onset, e.zeroVel).value;
  },
});

defineMetric({
  key: 'eccentric_peak_velocity',
  label: { de: 'Exzentrische Spitzengeschwindigkeit', en: 'Eccentric Peak Velocity' },
  unit: 'm/s',
  phase: 'eccentric',
  description: {
    de: 'Maximale Abwärtsgeschwindigkeit (negativ = nach unten).',
    en: 'Peak downward velocity (negative = downward).',
  },
  formula: 'min v(t), t ∈ [t_Onset, t(v=0)]',
  families: [...CM_DJ],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    const k = kin(c);
    return minRange(k.vel, e.onset - k.i0, e.zeroVel - k.i0).value;
  },
});

defineMetric({
  key: 'eccentric_decel_impulse',
  label: { de: 'Exzentrischer Brems-Impuls', en: 'Eccentric Deceleration Impulse' },
  unit: 'N·s',
  phase: 'braking',
  description: {
    de: 'Netto-Impuls von maximaler Abwärtsgeschwindigkeit bis v = 0 (entspricht m·|v_min|).',
    en: 'Net impulse from peak downward velocity to v = 0 (equals m·|v_min|).',
  },
  formula: '∫(F − BW) dt über [t(v_min), t(v=0)]',
  families: [...CM],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    return netImpulse(c, must(e.vMin), e.zeroVel);
  },
});

defineMetric({
  key: 'eccentric_decel_rfd',
  label: { de: 'Exzentrische Brems-RFD', en: 'Eccentric Deceleration RFD' },
  unit: 'N/s',
  phase: 'braking',
  higherIsBetter: true,
  description: {
    de: 'Mittlere Kraftanstiegsrate von maximaler Abwärtsgeschwindigkeit bis v = 0.',
    en: 'Average rate of force development from peak downward velocity to v = 0.',
  },
  formula: '(F(v=0) − F(v_min)) / (t(v=0) − t(v_min))',
  families: [...CM],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    const vm = must(e.vMin);
    return (forceAt(c, e.zeroVel) - forceAt(c, vm)) / sec(c, vm, e.zeroVel);
  },
});

defineMetric({
  key: 'braking_rfd',
  label: { de: 'Brems-RFD', en: 'Braking RFD' },
  unit: 'N/s',
  phase: 'braking',
  higherIsBetter: true,
  description: {
    de: 'Mittlere Kraftanstiegsrate von der minimalen Kraft (Ende der Entlastung) bis v = 0.',
    en: 'Average rate of force development from minimum force (end of unweighting) to v = 0.',
  },
  formula: '(F(v=0) − F_min) / (t(v=0) − t(F_min))',
  families: [...CM],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    const mf = must(e.minForce);
    return (forceAt(c, e.zeroVel) - forceAt(c, mf)) / sec(c, mf, e.zeroVel);
  },
});

defineMetric({
  key: 'countermovement_depth',
  label: { de: 'Gegenbewegungstiefe', en: 'Countermovement Depth' },
  unit: 'cm',
  phase: 'eccentric',
  description: {
    de: 'Vertikale COM-Verschiebung bis zum tiefsten Punkt (negativ = nach unten).',
    en: 'Vertical COM displacement to the lowest point (negative = downward).',
  },
  formula: 's(t(v=0)) = ∫v dt von Onset bis v=0',
  families: [...CM_DJ, 'landing'],
  compute: (c) => {
    cmOnly(c);
    return posCm(c, jumpEv(c).zeroVel);
  },
});

defineMetric({
  key: 'force_at_zero_velocity',
  label: { de: 'Kraft bei Nullgeschwindigkeit', en: 'Force at Zero Velocity' },
  unit: 'N',
  phase: 'eccentric',
  higherIsBetter: true,
  description: {
    de: 'Gesamtkraft im tiefsten Punkt der Gegenbewegung.',
    en: 'Total force at the lowest point of the countermovement.',
  },
  formula: 'F(t(v=0))',
  families: [...CM_DJ],
  compute: (c) => {
    cmOnly(c);
    return forceAt(c, jumpEv(c).zeroVel);
  },
});

// ───────────────────────────── Landung ─────────────────────────────
function landingWindow(c: RepContext): { a: number; b: number } {
  const e = jumpEv(c);
  return { a: must(e.landing), b: must(e.landingEnd) };
}

defineMetric({
  key: 'peak_landing_force',
  label: { de: 'Landungs-Spitzenkraft', en: 'Peak Landing Force' },
  unit: 'N',
  phase: 'landing',
  description: {
    de: 'Maximale Gesamtkraft nach der Landung (500-ms-Fenster).',
    en: 'Maximum total force after landing (500 ms window).',
  },
  formula: 'max F(t), t ∈ [t_Landung, t_Landung + 500 ms]',
  families: [...LAND],
  compute: (c) => {
    const w = landingWindow(c);
    return maxRange(c.total, w.a, w.b).value;
  },
});

defineMetric({
  key: 'landing_rfd',
  label: { de: 'Landungs-RFD', en: 'Landing RFD' },
  unit: 'N/s',
  phase: 'landing',
  description: {
    de: 'Mittlere Kraftanstiegsrate vom Erstkontakt bis zur Landungs-Spitzenkraft.',
    en: 'Average rate of force development from first contact to peak landing force.',
  },
  formula: '(F_peak,Landung − F(t_Landung)) / (t_peak − t_Landung)',
  families: [...LAND],
  compute: (c) => {
    const w = landingWindow(c);
    const pk = maxRange(c.total, w.a, w.b);
    if (pk.index - w.a < 0.5) return null;
    return (pk.value - forceAt(c, w.a)) / sec(c, w.a, pk.index);
  },
});

// ───────────────────────────── CMRJ-Rebound ─────────────────────────────
const reb = (c: RepContext) => must(c.ev.rebound, 'kein Rebound');

defineMetric({
  key: 'rebound_contact_time',
  label: { de: 'Rebound-Kontaktzeit', en: 'Rebound Contact Time' },
  unit: 's',
  phase: 'rebound',
  description: {
    de: 'Bodenkontaktzeit des Rebound-Sprungs (Landung → erneutes Abheben).',
    en: 'Ground contact time of the rebound jump (landing → next take-off).',
  },
  formula: 't_Kontakt = t_Takeoff,2 − t_Landung,1',
  families: ['cmrj'],
  compute: (c) => sec(c, reb(c).contactStart, reb(c).takeoff),
});

defineMetric({
  key: 'rebound_flight_time',
  label: { de: 'Rebound-Flugzeit', en: 'Rebound Flight Time' },
  unit: 's',
  phase: 'rebound',
  higherIsBetter: true,
  description: { de: 'Flugzeit des Rebound-Sprungs.', en: 'Flight time of the rebound jump.' },
  formula: 't_Landung,2 − t_Takeoff,2',
  families: ['cmrj'],
  compute: (c) => sec(c, reb(c).takeoff, must(reb(c).landing)),
});

defineMetric({
  key: 'rebound_jump_height',
  label: { de: 'Rebound-Sprunghöhe', en: 'Rebound Jump Height' },
  unit: 'cm',
  phase: 'rebound',
  higherIsBetter: true,
  description: {
    de: 'Sprunghöhe des Rebound-Sprungs aus der Flugzeit.',
    en: 'Rebound jump height from flight time.',
  },
  formula: 'h = g · t_Flug,2² / 8',
  families: ['cmrj'],
  compute: (c) => {
    const t = sec(c, reb(c).takeoff, must(reb(c).landing));
    return ((G * t * t) / 8) * 100;
  },
});

defineMetric({
  key: 'rebound_rsi',
  label: { de: 'Rebound-RSI', en: 'Rebound RSI' },
  unit: 'm/s',
  phase: 'rebound',
  higherIsBetter: true,
  description: {
    de: 'Reaktivkraft-Index des Rebounds: Sprunghöhe (Flugzeit) / Kontaktzeit.',
    en: 'Reactive strength index of the rebound: jump height (flight time) / contact time.',
  },
  formula: 'RSI = h_Flug,2 / t_Kontakt',
  families: ['cmrj'],
  compute: (c) => {
    const r = reb(c);
    const tf = sec(c, r.takeoff, must(r.landing));
    return (G * tf * tf) / 8 / sec(c, r.contactStart, r.takeoff);
  },
});

defineMetric({
  key: 'rebound_peak_force',
  label: { de: 'Rebound-Spitzenkraft', en: 'Rebound Peak Force' },
  unit: 'N',
  phase: 'rebound',
  description: { de: 'Maximale Kraft im Rebound-Kontakt.', en: 'Maximum force during the rebound contact.' },
  formula: 'max F(t), t ∈ [t_Landung,1, t_Takeoff,2]',
  families: ['cmrj'],
  compute: (c) => peakIn(c.total, reb(c).contactStart, reb(c).takeoff),
});

// ───────────────────────────── Asymmetrie (+ = rechts höher) ─────────────────────────────
const ASYM_NOTE =
  'Asymmetrie = (größere − kleinere Seite) / größere Seite · 100; Vorzeichen: + = rechts höher, − = links höher.';

defineMetric({
  key: 'asym_concentric_mean_force',
  label: { de: 'Asymmetrie konz. Mittelkraft', en: 'Concentric Mean Force Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie der konzentrischen Mittelkraft.',
    en: 'Left/right asymmetry of concentric mean force.',
  },
  formula: `Mittelkraft je Platte über [t(v=0), t_Takeoff]. ${ASYM_NOTE}`,
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return asymmetryPct(meanRange(c.left, e.zeroVel, e.takeoff), meanRange(c.right, e.zeroVel, e.takeoff));
  },
});

defineMetric({
  key: 'asym_eccentric_mean_force',
  label: { de: 'Asymmetrie exz. Mittelkraft', en: 'Eccentric Mean Force Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie der exzentrischen Mittelkraft.',
    en: 'Left/right asymmetry of eccentric mean force.',
  },
  formula: `Mittelkraft je Platte über [t_Onset, t(v=0)]. ${ASYM_NOTE}`,
  families: [...CM_DJ],
  compute: (c) => {
    cmOnly(c);
    const e = jumpEv(c);
    return asymmetryPct(meanRange(c.left, e.onset, e.zeroVel), meanRange(c.right, e.onset, e.zeroVel));
  },
});

defineMetric({
  key: 'asym_concentric_impulse',
  label: { de: 'Asymmetrie konz. Impuls', en: 'Concentric Impulse Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie des konzentrischen Netto-Impulses.',
    en: 'Left/right asymmetry of concentric net impulse.',
  },
  formula: `Netto-Impuls je Platte: ∫(F_Platte − Anteil_Ruhe·BW) dt über die konzentrische Phase. ${ASYM_NOTE}`,
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return asymmetryPct(
      plateImpulse(c, 'left', e.zeroVel, e.takeoff),
      plateImpulse(c, 'right', e.zeroVel, e.takeoff),
    );
  },
});

defineMetric({
  key: 'asym_takeoff_peak_force',
  label: { de: 'Asymmetrie Takeoff-Spitzenkraft', en: 'Takeoff Peak Force Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie der Spitzenkraft in der Abdruckphase.',
    en: 'Left/right asymmetry of peak force in the push-off phase.',
  },
  formula: `Spitzenkraft je Platte über die konzentrische Phase. ${ASYM_NOTE}`,
  families: [...PUSH_DJ],
  compute: (c) => {
    const e = jumpEv(c);
    return asymmetryPct(
      maxRange(c.left, e.zeroVel, e.takeoff).value,
      maxRange(c.right, e.zeroVel, e.takeoff).value,
    );
  },
});

defineMetric({
  key: 'asym_peak_landing_force',
  label: { de: 'Asymmetrie Landungs-Spitzenkraft', en: 'Peak Landing Force Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie der Spitzenkraft nach der Landung.',
    en: 'Left/right asymmetry of peak force after landing.',
  },
  formula: `Spitzenkraft je Platte im Landefenster. ${ASYM_NOTE}`,
  families: [...LAND],
  compute: (c) => {
    const w = landingWindow(c);
    return asymmetryPct(maxRange(c.left, w.a, w.b).value, maxRange(c.right, w.a, w.b).value);
  },
});
