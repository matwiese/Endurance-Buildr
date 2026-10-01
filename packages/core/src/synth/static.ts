import { G } from '../constants.ts';
import { makePchip } from './pchip.ts';
import { createRng, type Rng } from './prng.ts';
import type { Profile } from './profiles.ts';

const integrate = (f: (t: number) => number, a: number, b: number, n = 4000): number => {
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += f(a + (i + 0.5) * h);
  return s * h;
};

export interface IsometricParams {
  /** Basislinie (N): Körpergewicht in Testposition bzw. Vorspannung */
  baselineN: number;
  /** Netto-Spitzenkraft über der Basislinie (N); negativ = Kraft sinkt (invertiert) */
  peakNetN: number;
  /** Anstiegsdauer bis zur Spitze (s) */
  rise: number;
  hold: number;
  release?: number;
  /** Ruhe vor der Kontraktion im Profil selbst (s) – Onset-Wahrheit liegt dann bei `lead` */
  lead?: number;
}

/** Isometrische Kontraktion: sigmoidaler Anstieg (Yank ≈ 0,9·Peak/Anstiegszeit), Halten mit leichtem Abfall, Loslassen. */
export function isometricProfile(p: IsometricParams): Profile {
  const lead = p.lead ?? 1.2;
  const rise = p.rise;
  const release = p.release ?? 0.4;
  const shape = makePchip([0, 0.2 * rise, 0.55 * rise, rise], [0, 0.18, 0.68, 1], 0.9 / rise);
  const s = (t: number): number => {
    if (t < 0) return 0;
    if (t < rise) return shape(t);
    if (t < rise + p.hold) return 1 - 0.04 * ((t - rise) / p.hold);
    if (t < rise + p.hold + release)
      return 0.96 * (0.5 + 0.5 * Math.cos((Math.PI * (t - rise - p.hold)) / release));
    return 0;
  };
  const dur = lead + rise + p.hold + release;
  const force = (t: number): number => p.baselineN + p.peakNetN * s(t - lead);
  const truth: Record<string, number> = {
    peakForceN: p.baselineN + p.peakNetN,
    peakNetN: p.peakNetN,
    timeToPeak: rise,
    duration: rise + p.hold + release,
  };
  for (const w of [50, 100, 150, 200, 250]) truth[`rfd${w}`] = (p.peakNetN * s(w / 1000)) / (w / 1000);
  for (const w of [100, 200, 300]) truth[`impulse${w}`] = integrate((t) => p.peakNetN * s(t), 0, w / 1000);
  return {
    kind: 'isometric',
    duration: dur,
    force,
    stance: false,
    events: { onset: lead, peak: lead + rise },
    truth,
  };
}

export interface BalanceParams {
  mass: number;
  duration: number;
  /** stationäre SD der CoP-Schwankung (mm) */
  sigmaMl?: number;
  sigmaAp?: number;
  /** Zeitkonstante (s) des Ornstein-Uhlenbeck-Prozesses */
  tau?: number;
  /** Plattenmitte (mm) – 0 bei beidbeinigem Stand, ±250 bei Einbeinstand */
  centerX?: number;
  rng?: Rng;
  seed?: number;
}

/** Balance: CoP als Ornstein-Uhlenbeck-Prozess (stationäre SD vorgegeben), Kraft = Körpergewicht (+ Sway). */
export function balanceProfile(p: BalanceParams): Profile {
  const rng = p.rng ?? createRng(p.seed ?? 99);
  const bw = p.mass * G;
  const dt = 0.005;
  const n = Math.ceil(p.duration / dt) + 2;
  const tau = p.tau ?? 1.2;
  const sm = p.sigmaMl ?? 6;
  const sa = p.sigmaAp ?? 9;
  const ml = new Float64Array(n);
  const ap = new Float64Array(n);
  const a = Math.exp(-dt / tau);
  const q = Math.sqrt(1 - a * a);
  ml[0] = rng.normal() * sm;
  ap[0] = rng.normal() * sa;
  for (let i = 1; i < n; i++) {
    ml[i] = a * ml[i - 1]! + q * sm * rng.normal();
    ap[i] = a * ap[i - 1]! + q * sa * rng.normal();
  }
  const cx = p.centerX ?? 0;
  const at = (arr: Float64Array, t: number): number => {
    const x = Math.min(n - 2, Math.max(0, t / dt));
    const i = Math.floor(x);
    return arr[i]! * (1 - (x - i)) + arr[i + 1]! * (x - i);
  };
  // Wahrheit auf dem 200-Hz-Raster der Simulation (rauschfrei)
  let path = 0;
  for (let i = 1; i < n - 1; i++) path += Math.hypot(ml[i]! - ml[i - 1]!, ap[i]! - ap[i - 1]!);
  return {
    kind: 'balance',
    duration: p.duration,
    force: () => bw,
    stance: true,
    events: {},
    truth: { pathLength200: path, sigmaMl: sm, sigmaAp: sa, bodyWeightN: bw },
    cop: (t) => ({ x: cx + at(ml, t), y: at(ap, t) }),
  };
}
