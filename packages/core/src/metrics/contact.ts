import { velAt } from '../kinematics.ts';
import { asymmetryPct, maxRange, meanRange } from '../numerics.ts';
import { minPosition } from '../analysis/contexts.ts';
import { defineMetric } from './registry.ts';
import { flightHeightM, heightFromVelocity, kin, must, sec } from './helpers.ts';
import type { RepContext } from './types.ts';

const CONTACT = ['dj', 'hop'] as const;

function contact(c: RepContext): { start: number; end: number } {
  return { start: must(c.ev.contactStart), end: must(c.ev.takeoff) };
}

defineMetric({
  key: 'contact_time',
  label: { de: 'Bodenkontaktzeit', en: 'Contact Time' },
  unit: 's',
  phase: 'contact',
  higherIsBetter: false,
  description: {
    de: 'Dauer des Bodenkontakts von der Landung (Kraft > 20 N) bis zum Abheben.',
    en: 'Ground contact duration from landing (force > 20 N) to take-off.',
  },
  formula: 't_Kontakt = t_Takeoff − t_Landung',
  families: [...CONTACT],
  compute: (c) => {
    const k = contact(c);
    return sec(c, k.start, k.end);
  },
});

defineMetric({
  key: 'rsi',
  label: { de: 'RSI', en: 'RSI' },
  unit: 'm/s',
  phase: 'contact',
  higherIsBetter: true,
  description: {
    de: 'Reaktivkraft-Index: Sprunghöhe (Flugzeit) / Bodenkontaktzeit.',
    en: 'Reactive strength index: jump height (flight time) / ground contact time.',
  },
  formula: 'RSI = h_Flug / t_Kontakt,  h_Flug = g·t_Flug²/8',
  families: [...CONTACT],
  compute: (c) => {
    const k = contact(c);
    return flightHeightM(c) / sec(c, k.start, k.end);
  },
});

defineMetric({
  key: 'active_stiffness',
  label: { de: 'Aktive Steifigkeit', en: 'Active Stiffness' },
  unit: 'N/m',
  phase: 'contact',
  higherIsBetter: true,
  description: {
    de: 'Spitzenkraft im Kontakt geteilt durch die maximale COM-Absenkung (Federsteifigkeit des Beinsystems).',
    en: 'Peak contact force divided by maximum COM displacement (leg-spring stiffness).',
  },
  formula:
    'k = F_max,Kontakt / Δs_max,  Δs_max = −min s(t) im Kontakt (s ab Landung, v₀ ballistisch verankert)',
  families: [...CONTACT],
  compute: (c) => {
    const k = contact(c);
    const depth = -minPosition(kin(c), k.start, k.end);
    if (depth < 0.005) return null;
    return maxRange(c.total, k.start, k.end).value / depth;
  },
});

defineMetric({
  key: 'peak_drop_landing_force',
  label: { de: 'Drop-Landungs-Spitzenkraft', en: 'Peak Drop Landing Force' },
  unit: 'N',
  phase: 'contact',
  description: {
    de: 'Maximale Kraft im Kontakt nach dem Fallen vom Kasten.',
    en: 'Maximum force in the contact after stepping off the box.',
  },
  formula: 'max F(t), t ∈ [t_Landung, t_Takeoff]',
  families: ['dj'],
  compute: (c) => {
    const k = contact(c);
    return maxRange(c.total, k.start, k.end).value;
  },
});

defineMetric({
  key: 'contact_peak_force',
  label: { de: 'Kontakt-Spitzenkraft', en: 'Peak Contact Force' },
  unit: 'N',
  phase: 'contact',
  description: {
    de: 'Maximale Kraft im Bodenkontakt eines Hops.',
    en: 'Maximum force during the ground contact of a hop.',
  },
  formula: 'max F(t), t ∈ [t_Landung, t_Takeoff]',
  families: ['hop'],
  compute: (c) => {
    const k = contact(c);
    return maxRange(c.total, k.start, k.end).value;
  },
});

defineMetric({
  key: 'contact_mean_force',
  label: { de: 'Kontakt-Mittelkraft', en: 'Mean Contact Force' },
  unit: 'N',
  phase: 'contact',
  description: { de: 'Mittlere Kraft im Bodenkontakt.', en: 'Mean force during ground contact.' },
  formula: '(1/T) ∫F dt über den Kontakt',
  families: [...CONTACT],
  compute: (c) => {
    const k = contact(c);
    return meanRange(c.total, k.start, k.end);
  },
});

defineMetric({
  key: 'landing_velocity',
  label: { de: 'Landegeschwindigkeit', en: 'Landing Velocity' },
  unit: 'm/s',
  phase: 'landing',
  description: {
    de: 'Abwärtsgeschwindigkeit beim Aufprall (Betrag), aus Impulsbilanz bzw. Ruhe nach Stabilisierung abgeleitet.',
    en: 'Downward velocity at impact (magnitude), derived from the impulse balance or rest after stabilisation.',
  },
  formula: 'DJ/Hop: v₀ = v_TO(Flugzeit) − Δv_Kontakt;  Land&Hold: v(Stabilisierung)=0 ⇒ v₀ = −∫a dt',
  families: ['dj', 'landing'],
  compute: (c) => {
    const v0 = velAt(kin(c), must(c.ev.contactStart));
    return v0 < 0 ? -v0 : null;
  },
});

defineMetric({
  key: 'drop_height_est',
  label: { de: 'Fallhöhe (geschätzt)', en: 'Drop Height (est.)' },
  unit: 'cm',
  phase: 'landing',
  description: {
    de: 'Aus der Landegeschwindigkeit geschätzte Fallhöhe des Kastens.',
    en: 'Box drop height estimated from landing velocity.',
  },
  formula: 'h_Fall = v₀² / (2g)',
  families: ['dj', 'landing'],
  compute: (c) => {
    const v0 = velAt(kin(c), must(c.ev.contactStart));
    return v0 < 0 ? heightFromVelocity(-v0) * 100 : null;
  },
});

defineMetric({
  key: 'time_to_peak_force',
  label: { de: 'Zeit bis Spitzenkraft', en: 'Time to Peak Force' },
  unit: 's',
  phase: 'landing',
  description: {
    de: 'Zeit vom Erstkontakt bis zur maximalen Kraft im Landefenster.',
    en: 'Time from first contact to maximum force in the landing window.',
  },
  formula: 't(F_max) − t_Landung',
  families: ['landing'],
  compute: (c) => {
    const a = must(c.ev.contactStart);
    return sec(c, a, maxRange(c.total, a, must(c.ev.landingEnd)).index);
  },
});

defineMetric({
  key: 'time_to_stabilization',
  label: { de: 'Stabilisierungszeit', en: 'Time to Stabilisation' },
  unit: 's',
  phase: 'landing',
  higherIsBetter: false,
  description: {
    de: 'Zeit vom Erstkontakt, bis die Kraft ≥ 500 ms lang innerhalb von ±5 % BW bleibt.',
    en: 'Time from first contact until force stays within ±5 % BW for ≥ 500 ms.',
  },
  formula: 't_stab − t_Landung;  |F − BW| ≤ 0,05·BW für ≥ 500 ms',
  families: ['landing'],
  compute: (c) => sec(c, must(c.ev.contactStart), must(c.ev.stabilized)),
});

defineMetric({
  key: 'asym_contact_peak_force',
  label: { de: 'Asymmetrie Kontakt-Spitzenkraft', en: 'Contact Peak Force Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie der Spitzenkraft im (Drop-)Kontakt.',
    en: 'Left/right asymmetry of peak force in the (drop) contact.',
  },
  formula:
    'Spitzenkraft je Platte im Kontakt. Asymmetrie = (größere − kleinere Seite)/größere · 100; + = rechts höher.',
  families: ['dj', 'hop'],
  compute: (c) => {
    const k = contact(c);
    return asymmetryPct(maxRange(c.left, k.start, k.end).value, maxRange(c.right, k.start, k.end).value);
  },
});

defineMetric({
  key: 'asym_landing_mean_force',
  label: { de: 'Asymmetrie Landungs-Mittelkraft', en: 'Landing Mean Force Asymmetry' },
  unit: '%',
  kind: 'asymmetry',
  phase: 'asymmetry',
  description: {
    de: 'Links/Rechts-Asymmetrie der Mittelkraft im Landefenster (Land and Hold).',
    en: 'Left/right asymmetry of mean force in the landing window (land and hold).',
  },
  formula: 'Mittelkraft je Platte über [t_Landung, t_Landung+500 ms]. Vorzeichen: + = rechts höher.',
  families: ['landing'],
  compute: (c) => {
    const a = must(c.ev.contactStart);
    const b = must(c.ev.landingEnd);
    return asymmetryPct(meanRange(c.left, a, b), meanRange(c.right, a, b));
  },
});
