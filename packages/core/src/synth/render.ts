import { G } from '../constants.ts';
import { DEFAULT_PLATE_GEOMETRY, plateCenterX, type PlateGeometry } from '../cop.ts';
import type { ForceTrace } from '../types.ts';
import { createRng, type Rng } from './prng.ts';
import type { Profile } from './profiles.ts';

export interface AthleteModel {
  /** Körpermasse (kg) – nur Beschreibung, Profile tragen ihre eigene Masse */
  bodyMass: number;
  /** Rechtsanteil − Linksanteil der Last (z. B. +0,1 ⇒ R 55 % / L 45 %) */
  asymmetry: number;
  /** Sensorrauschen SD je Platte (N), Standard 1 (≈ ±2 N Spitze) */
  noiseN: number;
  /** Sway der Gesamtkraft im Stand (N Amplitude) */
  swayN: number;
  /** Gewichtsverlagerung links/rechts („Rocking“) als Bruchteil von BW */
  rockingFrac: number;
  /** einbeinig: andere Platte bleibt unbelastet */
  singleLeg: 'left' | 'right' | null;
  /** Quantisierung der Plattenwerte (N), 0 = aus */
  quantizeN: number;
}

export const DEFAULT_ATHLETE: AthleteModel = {
  bodyMass: 80,
  asymmetry: 0,
  noiseN: 1,
  swayN: 1.5,
  rockingFrac: 0.02,
  singleLeg: null,
  quantizeN: 0,
};

export interface SegmentTruth {
  kind: Profile['kind'];
  /** Start/Ende in Sekunden ab Skriptbeginn */
  start: number;
  end: number;
  /** absolute Ereigniszeiten (s) */
  events: Record<string, number>;
  truth: Record<string, number>;
}

export interface RenderedScript {
  trace: ForceTrace;
  /** Eckenlasten n×8 (nur wenn ein Profil CoP liefert oder `corners` gesetzt ist) */
  corners?: Float32Array;
  /** rauschfreier CoP (mm) der Balance-Profile – Wahrheit für Tests */
  cleanCop?: { x: Float32Array; y: Float32Array };
  segments: SegmentTruth[];
  /** rauschfreie Gesamtkraft (zur Kontrolle) */
  cleanTotal: Float64Array;
}

/**
 * Streamfähiger Sample-Erzeuger: macht aus Profil-Kraft F(t) zwei Plattenwerte (Links/Rechts-Aufteilung mit Asymmetrie,
 * Rocking und Sway im Stand, Gaußsches Sensorrauschen). Wird vom Skript-Renderer und vom Echtzeit-Simulator genutzt.
 */
export class SampleSynth {
  athlete: AthleteModel;
  readonly rng: Rng;
  private readonly phL: number;
  private readonly phS1: number;
  private readonly phS2: number;
  private readonly rockHz: number;
  /** geglätteter Linksanteil (Übergang beim Heben/Aufsetzen eines Fußes) */
  private shareLSmooth: number | null = null;
  private lastT = 0;

  constructor(athlete: Partial<AthleteModel>, rng: Rng) {
    this.athlete = { ...DEFAULT_ATHLETE, ...athlete };
    this.rng = rng;
    this.phL = rng.range(0, 2 * Math.PI);
    this.phS1 = rng.range(0, 2 * Math.PI);
    this.phS2 = rng.range(0, 2 * Math.PI);
    this.rockHz = rng.range(0.2, 0.4);
  }

  /** Ziel-Linksanteil ohne Rocking */
  baseShareL(): number {
    const a = this.athlete;
    return a.singleLeg === 'left' ? 1 : a.singleLeg === 'right' ? 0 : 0.5 - a.asymmetry / 2;
  }

  /**
   * Ein Sample: `force` = Profilkraft (N), `t` = globale Zeit (s), `env` = Hüllkurve 0..1 für Sway/Rocking (nur im Stand > 0).
   */
  sample(
    force: number,
    t: number,
    env: number,
    stance: boolean,
  ): { left: number; right: number; clean: number } {
    const a = this.athlete;
    let f = force;
    if (stance)
      f +=
        env *
        a.swayN *
        (0.6 * Math.sin(2 * Math.PI * 0.31 * t + this.phS1) +
          0.4 * Math.sin(2 * Math.PI * 0.77 * t + this.phS2));
    let target = this.baseShareL();
    if (a.singleLeg === null && stance)
      target += env * a.rockingFrac * Math.sin(2 * Math.PI * this.rockHz * t + this.phL);
    target = Math.min(1, Math.max(0, target));
    const dt = Math.max(0, t - this.lastT);
    this.lastT = t;
    // Bei unbelasteter Platte (Flug/leer) wählt die Person das Standbein frei: Anteil springt ohne Glättung
    if (this.shareLSmooth === null || Math.abs(force) < 5) this.shareLSmooth = target;
    else this.shareLSmooth += (target - this.shareLSmooth) * (1 - Math.exp(-dt / 0.12));
    const shareL = this.shareLSmooth;
    let l = f * shareL + this.rng.normal() * a.noiseN;
    let r = f * (1 - shareL) + this.rng.normal() * a.noiseN;
    if (a.quantizeN > 0) {
      l = Math.round(l / a.quantizeN) * a.quantizeN;
      r = Math.round(r / a.quantizeN) * a.quantizeN;
    }
    return { left: l, right: r, clean: f };
  }
}

/**
 * Eckenlasten [lFL, lFR, lBL, lBR, rFL, rFR, rBL, rBR] aus Plattenkräften und (optionalem) globalem CoP in mm.
 * Beidbeinig bestimmt der ML-Anteil des CoP die Links/Rechts-Aufteilung, AP wirkt auf beiden Platten gleich.
 */
export function cornersFor(
  left: number,
  right: number,
  cop: { x: number; y: number } | null,
  g: PlateGeometry,
  noiseN: number,
  rng: Rng,
): number[] {
  const out: number[] = [];
  const total = left + right;
  const cL = plateCenterX(g, 'left');
  const cR = plateCenterX(g, 'right');
  for (const side of ['left', 'right'] as const) {
    const F = side === 'left' ? left : right;
    // lokaler CoP der Platte (mm, relativ zur Plattenmitte)
    let lx = 0;
    let ly = 0;
    if (cop && total > 1) {
      const c = side === 'left' ? cL : cR;
      // beidbeinig: Plattenanteil folgt dem ML-CoP → lokal 0; einbeinig: CoP relativ zur belasteten Platte
      const onlyThis = (side === 'left' ? right : left) < 0.02 * total;
      lx = onlyThis ? cop.x - c : 0;
      ly = cop.y;
    }
    const xn = Math.max(-1, Math.min(1, lx / (g.widthMm / 2)));
    const yn = Math.max(-1, Math.min(1, ly / (g.lengthMm / 2)));
    const q = F / 4;
    const e = noiseN / 2;
    out.push(
      q * (1 - xn + yn) + rng.normal() * e,
      q * (1 + xn + yn) + rng.normal() * e,
      q * (1 - xn - yn) + rng.normal() * e,
      q * (1 + xn - yn) + rng.normal() * e,
    );
  }
  return out;
}

/** Hüllkurve (0..1) für Sway/Rocking: 1 im Stand, an den Profilrändern sanft ein-/ausgeblendet. */
export const stanceEnvelope = (local: number, duration: number, fadeS = 0.3): number =>
  Math.max(0, Math.min(1, local / fadeS, (duration - local) / fadeS));

/**
 * Setzt Profile zu einer Aufnahme zusammen (abgetastet bei `hz`). Deterministisch über `seed`.
 */
export function renderScript(
  profiles: readonly Profile[],
  opts: {
    hz: number;
    athlete?: Partial<AthleteModel>;
    seed?: number;
    rng?: Rng;
    fadeS?: number;
    geometry?: PlateGeometry;
    corners?: boolean;
  },
): RenderedScript {
  const hz = opts.hz;
  const rng = opts.rng ?? createRng(opts.seed ?? 1);
  const synth = new SampleSynth(opts.athlete ?? {}, rng);
  const fade = opts.fadeS ?? 0.3;
  const total = profiles.reduce((s, p) => s + p.duration, 0);
  const n = Math.round(total * hz);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const clean = new Float64Array(n);
  const geometry = opts.geometry ?? DEFAULT_PLATE_GEOMETRY;
  const wantCorners = opts.corners ?? profiles.some((p) => p.cop !== undefined);
  const corners = wantCorners ? new Float32Array(n * 8) : undefined;
  const copX = wantCorners ? new Float32Array(n) : undefined;
  const copY = wantCorners ? new Float32Array(n) : undefined;

  const segments: SegmentTruth[] = [];
  const starts: number[] = [];
  let start = 0;
  for (const p of profiles) {
    starts.push(start);
    segments.push({
      kind: p.kind,
      start,
      end: start + p.duration,
      events: Object.fromEntries(
        Object.entries(p.events)
          .filter(([, v]) => Number.isFinite(v))
          .map(([k, v]) => [k, start + v]),
      ),
      truth: p.truth,
    });
    start += p.duration;
  }

  let pi = 0;
  for (let k = 0; k < n; k++) {
    const t = k / hz;
    while (pi < profiles.length - 1 && t >= starts[pi]! + profiles[pi]!.duration) pi++;
    const p = profiles[pi]!;
    const local = Math.min(p.duration, t - starts[pi]!);
    const env = p.stance ? stanceEnvelope(local, p.duration, fade) : 0;
    let s = synth.sample(p.force(local), t, env, p.stance);
    let cop: { x: number; y: number } | null = null;
    if (p.cop) {
      cop = p.cop(local);
      // Balance: Plattenaufteilung folgt dem ML-CoP (beidbeinig) bzw. der Einbeinvorgabe
      const a = synth.athlete;
      let shareL: number;
      if (a.singleLeg === 'left') shareL = 1;
      else if (a.singleLeg === 'right') shareL = 0;
      else {
        const cL = plateCenterX(geometry, 'left');
        const cR = plateCenterX(geometry, 'right');
        shareL = Math.max(0, Math.min(1, (cR - cop.x) / (cR - cL)));
      }
      s = { ...s, left: s.clean * shareL, right: s.clean * (1 - shareL) };
    }
    if (corners) {
      const cs = cornersFor(
        cop ? s.left : s.left,
        cop ? s.right : s.right,
        cop,
        geometry,
        synth.athlete.noiseN,
        synth.rng,
      );
      for (let q = 0; q < 8; q++) corners[k * 8 + q] = cs[q]!;
      if (cop) {
        s = { ...s, left: cs[0]! + cs[1]! + cs[2]! + cs[3]!, right: cs[4]! + cs[5]! + cs[6]! + cs[7]! };
        copX![k] = cop.x;
        copY![k] = cop.y;
      }
    }
    left[k] = s.left;
    right[k] = s.right;
    clean[k] = s.clean;
  }
  return {
    trace: { hz, left, right },
    corners,
    cleanCop: copX && copY ? { x: copX, y: copY } : undefined,
    segments,
    cleanTotal: clean,
  };
}

/** Körpergewicht (N) für eine Masse. */
export const weightN = (massKg: number): number => massKg * G;
