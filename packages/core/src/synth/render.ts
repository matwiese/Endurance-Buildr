import { G } from '../constants.ts';
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

/** Hüllkurve (0..1) für Sway/Rocking: 1 im Stand, an den Profilrändern sanft ein-/ausgeblendet. */
export const stanceEnvelope = (local: number, duration: number, fadeS = 0.3): number =>
  Math.max(0, Math.min(1, local / fadeS, (duration - local) / fadeS));

/**
 * Setzt Profile zu einer Aufnahme zusammen (abgetastet bei `hz`). Deterministisch über `seed`.
 */
export function renderScript(
  profiles: readonly Profile[],
  opts: { hz: number; athlete?: Partial<AthleteModel>; seed?: number; rng?: Rng; fadeS?: number },
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
    const s = synth.sample(p.force(local), t, env, p.stance);
    left[k] = s.left;
    right[k] = s.right;
    clean[k] = s.clean;
  }
  return { trace: { hz, left, right }, segments, cleanTotal: clean };
}

/** Körpergewicht (N) für eine Masse. */
export const weightN = (massKg: number): number => massKg * G;
