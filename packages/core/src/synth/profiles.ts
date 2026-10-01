import { G } from '../constants.ts';
import { makePchip } from './pchip.ts';

/**
 * Physikbasierte Kraftprofile. Jede Phase ist eine analytische Funktion F(t) (Gesamtkraft in N), deren Netto-Impuls
 * exakt so skaliert wird, dass die gewünschte Abheb-/Landegeschwindigkeit entsteht (lineare Lösung, keine Iteration).
 * Wahrheitswerte stammen aus der Konstruktion bzw. feiner numerischer Integration – nie aus dem Analysecode.
 */
export type ProfileKind =
  | 'empty'
  | 'stand'
  | 'pushoff'
  | 'flight'
  | 'catch'
  | 'bounce'
  | 'aborted'
  | 'stepOn'
  | 'stepOff'
  | 'isometric'
  | 'balance';

export interface Profile {
  kind: ProfileKind;
  /** Dauer (s) */
  duration: number;
  /** Gesamtkraft (N) bei lokaler Zeit t ∈ [0, duration] */
  force: (t: number) => number;
  /** Ruhestand: Sway/Rocking werden überlagert */
  stance: boolean;
  /** relative Ereigniszeiten (s) */
  events: Record<string, number>;
  /** Wahrheitswerte (SI bzw. N) */
  truth: Record<string, number>;
  /** nur Balance: CoP (mm, globales Koordinatensystem) */
  cop?: (t: number) => { x: number; y: number };
}

const integrate = (f: (t: number) => number, a: number, b: number, n = 4000): number => {
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += f(a + (i + 0.5) * h);
  return s * h;
};

export const emptyProfile = (duration: number): Profile => ({
  kind: 'empty',
  duration,
  force: () => 0,
  stance: false,
  events: {},
  truth: {},
});

export const standProfile = (bodyMass: number, duration: number, loadKg = 0): Profile => ({
  kind: 'stand',
  duration,
  force: () => (bodyMass + loadKg) * G,
  stance: true,
  events: {},
  truth: { bodyWeightN: (bodyMass + loadKg) * G },
});

export const flightProfile = (vTakeoff: number): Profile => ({
  kind: 'flight',
  duration: (2 * vTakeoff) / G,
  force: () => 0,
  stance: false,
  events: {},
  truth: { flightTime: (2 * vTakeoff) / G },
});

// ───────────────────────────── Abdruck (CMJ / SJ) ─────────────────────────────

export interface PushOffParams {
  /** Systemmasse (Körper + Last), kg – bestimmt das Körpergewicht */
  mass: number;
  /** Ziel-Sprunghöhe (Impuls-Momentum), m */
  jumpHeight: number;
  kind?: 'cmj' | 'sj';
  /** Tiefe der Entlastung in Vielfachen von BW (CMJ), Standard 0,55 */
  unweight?: number;
  /** Zeitskala (1 = typischer CMJ ≈ 0,87 s Kontraktionszeit) */
  tempo?: number;
}

export function pushOffProfile(p: PushOffParams): Profile {
  const bw = p.mass * G;
  const kind = p.kind ?? 'cmj';
  const tempo = p.tempo ?? 1;
  const du = kind === 'cmj' ? (p.unweight ?? 0.55) : 0;
  const vTo = Math.sqrt(2 * G * p.jumpHeight);
  const T1 = 0.5 * tempo;
  const ta = kind === 'cmj' ? 0.3 * tempo : 0;
  const Lp = (kind === 'cmj' ? 0.52 : 0.5) * tempo;
  const Te = ta + Lp;
  const D = 0.045; // lineare Rampe auf 0 N (Abheben)

  const sn = (t: number): number =>
    kind === 'cmj' && t > 0 && t < T1 ? -du * Math.sin(Math.PI * Math.pow(t / T1, 0.85)) ** 2 : 0;
  const shape = makePchip(
    [0, 0.12, 0.35, 0.6, 0.85, 1],
    [0, 0.45, 1, 0.95, 0.55, 0.28],
    kind === 'sj' ? 5 : 0,
  );
  const sp = (t: number): number => (t < ta || t > Te ? 0 : shape((t - ta) / Lp));

  const Sn = integrate(sn, 0, Te);
  const Sp = integrate(sp, ta, Te);
  const spE = sp(Te);
  // v_TO/g = Sn + A·(Sp + D·spE/2) − D/2   (siehe Kopfkommentar)
  const A = (vTo / G - Sn + D / 2) / (Sp + (D * spE) / 2);
  const fE = bw * (1 + sn(Te) + A * spE);
  const force = (t: number): number => {
    if (t < 0) return bw;
    if (t <= Te) return bw * (1 + sn(t) + A * sp(t));
    if (t <= Te + D) return fE * (1 - (t - Te) / D);
    return 0;
  };
  const T = Te + D;

  // Wahrheit durch feine Integration (v ab t = 0 mit v = 0, Referenz-Konvention)
  const dt = 2e-5;
  const n = Math.round(T / dt);
  let v = 0;
  let s = 0;
  let vMin = 0;
  let tVmin = 0;
  let zeroVelT = kind === 'cmj' ? NaN : 0;
  let depth = 0;
  let minF = Infinity;
  let tMinF = 0;
  let peakF = 0;
  let tPeakF = 0;
  let onset20 = NaN;
  let prevA = (force(0) - bw) / p.mass;
  let sAtZero = 0;
  for (let i = 1; i <= n; i++) {
    const t = i * dt;
    const f = force(t);
    const a = (f - bw) / p.mass;
    const vPrev = v;
    v += 0.5 * (a + prevA) * dt;
    s += 0.5 * (v + vPrev) * dt;
    prevA = a;
    if (Number.isNaN(onset20) && Math.abs(f - bw) > 20) onset20 = t;
    if (v < vMin) {
      vMin = v;
      tVmin = t;
    }
    if (kind === 'cmj' && Number.isNaN(zeroVelT) && vMin < -0.05 && vPrev < 0 && v >= 0) {
      zeroVelT = t;
      sAtZero = s;
      depth = -sAtZero;
    }
    if (Number.isNaN(zeroVelT) || t <= tVmin) {
      if (f < minF) {
        minF = f;
        tMinF = t;
      }
    }
    if (!Number.isNaN(zeroVelT) && t >= zeroVelT && f > peakF) {
      peakF = f;
      tPeakF = t;
    }
  }
  if (kind === 'sj') {
    for (let i = 1; i <= n; i++)
      if (force(i * dt) > peakF) {
        peakF = force(i * dt);
        tPeakF = i * dt;
      }
  }
  const takeoff20 = Te + D * (1 - 20 / fE);
  return {
    kind: 'pushoff',
    duration: T,
    force,
    stance: false,
    events: {
      onset20,
      vMin: tVmin,
      zeroVel: zeroVelT,
      minForce: tMinF,
      peakForce: tPeakF,
      takeoff: T,
      takeoff20,
    },
    truth: {
      vTakeoff: v,
      jumpHeight: (v * v) / (2 * G),
      flightTime: (2 * v) / G,
      contractionTime: T - onset20,
      depth,
      peakForceN: peakF,
      minForceN: minF === Infinity ? bw : minF,
      concentricImpulse: p.mass * v,
      bodyWeightN: bw,
      takeoffSlope: fE / D,
    },
  };
}

/** Fehlversuch: Entlastung + Abdruck, aber ohne Abheben (Kraft bleibt > 0, v endet bei 0). */
export function abortedProfile(mass: number, tempo = 1): Profile {
  const bw = mass * G;
  const T1 = 0.5 * tempo;
  const ta = 0.3 * tempo;
  const Lp = 0.5 * tempo;
  const Te = ta + Lp;
  const du = 0.35;
  const sn = (t: number): number =>
    t > 0 && t < T1 ? -du * Math.sin(Math.PI * Math.pow(t / T1, 0.85)) ** 2 : 0;
  const shape = makePchip([0, 0.2, 0.5, 0.8, 1], [0, 0.6, 1, 0.3, 0], 0, 0);
  const sp = (t: number): number => (t < ta || t > Te ? 0 : shape((t - ta) / Lp));
  const A = -integrate(sn, 0, Te) / integrate(sp, ta, Te);
  return {
    kind: 'aborted',
    duration: Te,
    force: (t) => bw * (1 + sn(t) + A * sp(t)),
    stance: false,
    events: {},
    truth: {},
  };
}

// ───────────────────────────── Landung / Kontakt ─────────────────────────────

const CATCH_X = [0.006, 0.025, 0.06, 0.12, 0.22, 0.35, 0.5, 0.65];
const CATCH_Y = [1.0, 0.9, 0.55, 0.6, 0.25, 0.06, -0.04, 0.0];

/** Landung mit Abfangen (Kraft klingt auf BW ab). vIn = Aufprallgeschwindigkeit (m/s, Betrag). */
export function catchProfile(mass: number, vIn: number, durationScale = 1): Profile {
  const bw = mass * G;
  const t0 = 0.006;
  const xs = CATCH_X.map((x, i) => (i === 0 ? t0 : x * durationScale));
  const q = makePchip(xs, CATCH_Y, undefined, 0);
  const Tl = xs[xs.length - 1]!;
  const Q = integrate(q, t0, Tl);
  const q0 = q(t0);
  const B = (vIn / G + t0 / 2) / (Q + (q0 * t0) / 2);
  const f0 = bw * (1 + B * q0);
  const force = (t: number): number => {
    if (t <= 0) return 0;
    if (t < t0) return f0 * (t / t0);
    if (t <= Tl) return bw * (1 + B * q(t));
    return bw;
  };
  let peak = 0;
  let tPeak = 0;
  for (let i = 0; i <= 2000; i++) {
    const t = (i / 2000) * Tl;
    const f = force(t);
    if (f > peak) {
      peak = f;
      tPeak = t;
    }
  }
  return {
    kind: 'catch',
    duration: Tl,
    force,
    stance: false,
    events: { landing: 0, landing20: (t0 * 20) / f0, peakForce: tPeak },
    truth: { peakForceN: peak, vIn, bodyWeightN: bw, landingSlope: f0 / t0 },
  };
}

export interface BounceParams {
  mass: number;
  /** Aufprallgeschwindigkeit (m/s, Betrag, nach unten) */
  vIn: number;
  /** Abhebegeschwindigkeit (m/s, nach oben) */
  vOut: number;
  /** Kontaktdauer (s) */
  contact: number;
  /** zusätzliche Aufprallspitze (Vielfache der Hauptkurve), DJ größer */
  spike?: number;
}

/** Kontakt mit Wiederabheben (Hop, CMRJ-Rebound, DJ). Netto-Impuls = m·(vIn + vOut). */
export function bounceProfile(p: BounceParams): Profile {
  const bw = p.mass * G;
  const Tc = p.contact;
  const t0 = 0.005;
  const D = Math.min(0.03, 0.25 * Tc);
  const Te = Tc - D;
  const spike = p.spike ?? 0.4;
  const base = makePchip(
    [t0 / Tc, 0.1, 0.28, 0.45, 0.65, 0.82, Te / Tc],
    [0.9, 0.75, 0.95, 1.15, 0.95, 0.55, 0.25],
  );
  const r = (t: number): number => base(t / Tc) + spike * Math.exp(-t / 0.012);
  const R = integrate(r, t0, Te);
  const r0 = r(t0);
  const rE = r(Te);
  const C = ((p.vIn + p.vOut) / G + t0 / 2 + D / 2) / (R + (r0 * t0) / 2 + (rE * D) / 2);
  const f0 = bw * (1 + C * r0);
  const fE = bw * (1 + C * rE);
  const force = (t: number): number => {
    if (t <= 0) return 0;
    if (t < t0) return f0 * (t / t0);
    if (t <= Te) return bw * (1 + C * r(t));
    if (t <= Tc) return fE * (1 - (t - Te) / D);
    return 0;
  };
  let peak = 0;
  let tPeak = 0;
  for (let i = 0; i <= 2000; i++) {
    const t = (i / 2000) * Tc;
    const f = force(t);
    if (f > peak) {
      peak = f;
      tPeak = t;
    }
  }
  return {
    kind: 'bounce',
    duration: Tc,
    force,
    stance: false,
    events: {
      landing: 0,
      landing20: (t0 * 20) / f0,
      takeoff: Tc,
      takeoff20: Te + D * (1 - 20 / fE),
      peakForce: tPeak,
    },
    truth: {
      contactTime: Tc,
      peakForceN: peak,
      vIn: p.vIn,
      vOut: p.vOut,
      jumpHeight: (p.vOut * p.vOut) / (2 * G),
      flightTime: (2 * p.vOut) / G,
      bodyWeightN: bw,
    },
  };
}

// ───────────────────────────── Auf-/Abtreten ─────────────────────────────

/** Auftreten auf die Platten: gleitendes Belasten (kein Aufprall). */
export function stepOnProfile(mass: number, duration = 0.9): Profile {
  const bw = mass * G;
  const shape = makePchip([0, 0.25, 0.5, 0.75, 1], [0, 0.45, 1.08, 1.02, 1], 0, 0);
  return {
    kind: 'stepOn',
    duration,
    force: (t) => bw * shape(Math.min(1, Math.max(0, t / duration))),
    stance: false,
    events: {},
    truth: {},
  };
}

/** Abtreten: Kraft fällt gleitend auf 0 (kein Flug; vorher kein Kraftanstieg). */
export function stepOffProfile(mass: number, duration = 0.8): Profile {
  const bw = mass * G;
  const shape = makePchip([0, 0.3, 0.6, 0.85, 1], [1, 0.95, 0.5, 0.1, 0], 0, 0);
  return {
    kind: 'stepOff',
    duration,
    force: (t) => bw * shape(Math.min(1, Math.max(0, t / duration))),
    stance: false,
    events: {},
    truth: {},
  };
}
