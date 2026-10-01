import {
  G,
  SampleSynth,
  abortedProfile,
  cmrjTrial,
  createRng,
  djTrial,
  emptyProfile,
  hopTrial,
  jumpTrial,
  landHoldTrial,
  stanceEnvelope,
  standProfile,
  stepOffProfile,
  stepOnProfile,
  type AthleteModel,
  type Profile,
  type Rng,
  type TestType,
  DEFAULT_PLATE_GEOMETRY,
  balanceProfile,
  cornersFor,
  isometricProfile,
  plateCenterX,
  type PlateGeometry,
} from '@buildr/core';
import { BaseAdapter, DeviceError, type DeviceInfo, type Sample } from './types.ts';

export type SimTrialType = TestType | 'failed_attempt';

export interface SimulatorOptions {
  hz?: number;
  seed?: number;
  /** Athlet: Körpermasse, Asymmetrie (R−L-Anteil), Rauschen, … */
  athlete?: Partial<AthleteModel>;
  /** Standard-Sprungvermögen (CMJ-Höhe in m); jeder Versuch variiert zufällig um ~5 % */
  jumpAbility?: number;
  /** Roh-Offsets der Platten (N) – werden durch das Nullen entfernt */
  plateOffsets?: { left: number; right: number };
  /** 'realtime' (Timer) oder 'manual' (advance(ms), deterministisch für Tests) */
  clock?: 'realtime' | 'manual';
  /** Echtzeit-Faktor (> 1 = beschleunigt) */
  speed?: number;
  batchMs?: number;
  startStanding?: boolean;
  /** Störungen für Jitterbuffer-/Paketverlust-Tests */
  impair?: { dropProb?: number; reorderProb?: number; timestampJitterUs?: number };
  now?: () => number;
  /** Eckensensor-Daten (CoP) liefern */
  corners?: boolean;
  geometry?: PlateGeometry;
}

export interface TrialParams {
  jumpHeightM?: number;
  reboundHeightM?: number;
  loadKg?: number;
  dropHeightM?: number;
  hops?: number;
  side?: 'left' | 'right';
  contactS?: number;
  /** Isometrie: Netto-Spitze (N) bzw. relativ zum Körpergewicht, Anstiegs-/Haltezeit */
  peakNetN?: number;
  riseS?: number;
  holdS?: number;
  /** Balance: Dauer und Schwankung (SD) in mm; `unstable` verdoppelt die Schwankung (Augen zu / instabile Unterlage) */
  durationS?: number;
  sigmaMm?: number;
  unstable?: boolean;
}

interface QueueItem {
  profile: Profile;
  override?: Partial<AthleteModel>;
  /** Zustand der Platte, in den der Athlet nach diesem Element übergeht */
  then?: 'standing' | 'empty';
  label?: string;
  onDone?: () => void;
}

export type Presence = 'empty' | 'standing' | 'moving';

const STATIC_TYPES: ReadonlySet<SimTrialType> = new Set<SimTrialType>([
  'isometric',
  'imtp',
  'iso_squat',
  'shoulder_iso_i',
  'shoulder_iso_y',
  'shoulder_iso_t',
  'quiet_stand',
  'sl_stand',
  'sl_range_of_stability',
]);
const STANCE_TYPES: ReadonlySet<SimTrialType> = new Set<SimTrialType>([
  'cmj',
  'loaded_cmj',
  'abalakov',
  'sj',
  'loaded_sj',
  'cmrj',
  'sl_jump',
  'sl_cmrj',
  'hop',
  'sl_hop',
  'sl_hop_return',
  'failed_attempt',
]);
const SINGLE_LEG_TYPES: ReadonlySet<SimTrialType> = new Set<SimTrialType>([
  'sl_jump',
  'sl_cmrj',
  'sl_dj',
  'sl_hop',
  'sl_hop_return',
  'sl_land_hold',
  'sl_stand',
  'sl_range_of_stability',
]);

/**
 * Simulator-Plattenpaar mit synthetischem Athleten (physikbasierte Kraftkurven, siehe @buildr/core/synth).
 * Liefert Rohdaten wie echte Platten (Offsets, Rauschen ≈ ±1–2 N, Sway, Gewichts-„Rocking“, Links/Rechts-Asymmetrie)
 * und „spielt“ Tests inkl. Ruhephasen und Fehlversuchen ab. Steuerung: stepOn/stepOff/perform/setLoad.
 */
export class SimulatorAdapter extends BaseAdapter {
  readonly info: DeviceInfo;
  private readonly o: Required<
    Pick<SimulatorOptions, 'seed' | 'jumpAbility' | 'clock' | 'speed' | 'batchMs'>
  > &
    SimulatorOptions;
  private readonly rng: Rng;
  private readonly impairRng: Rng;
  private readonly synth: SampleSynth;
  private readonly offsets: { left: number; right: number };
  private hz: number;
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAtMs = 0;
  private producedAtStart = 0;
  private queue: QueueItem[] = [];
  private cur: { item: QueueItem; startIdx: number } | null = null;
  private idle: 'empty' | 'standing';
  private idleSince = 0;
  private load = 0;
  private lastBatteryEmit = 0;
  private idleWaiters: Array<() => void> = [];
  private droppedByImpair = 0;
  private baseAthlete: Partial<AthleteModel>;
  private readonly geometry: PlateGeometry;

  constructor(options: SimulatorOptions = {}) {
    super();
    this.o = {
      seed: options.seed ?? 1,
      jumpAbility: options.jumpAbility ?? 0.38,
      clock: options.clock ?? 'realtime',
      speed: options.speed ?? 1,
      batchMs: options.batchMs ?? 10,
      ...options,
    };
    this.hz = options.hz ?? 1000;
    this.rng = createRng(this.o.seed);
    this.impairRng = createRng(this.o.seed + 777);
    this.baseAthlete = { bodyMass: 80, ...options.athlete };
    this.geometry = options.geometry ?? DEFAULT_PLATE_GEOMETRY;
    this.synth = new SampleSynth(this.baseAthlete, createRng(this.o.seed + 101));
    this.offsets = options.plateOffsets ?? { left: 14.2, right: -9.7 };
    this.idle = options.startStanding ? 'standing' : 'empty';
    this.info = {
      kind: 'simulator',
      name: 'Simulator-Plattenpaar',
      serial: `SIM-${this.o.seed.toString(16).padStart(6, '0')}`,
      plates: 2,
      supportedHz: [200, 500, 1000],
      hasCorners: !!options.corners,
      geometry: options.geometry ?? DEFAULT_PLATE_GEOMETRY,
    };
    this._status = { ...this._status, samplingHz: this.hz, batteryPct: 87 };
  }

  get presence(): Presence {
    if (this.cur && this.cur.item.profile.kind !== 'stand') {
      const k = this.cur.item.profile.kind;
      if (k === 'stepOn' || k === 'stepOff') return 'moving';
      return 'moving';
    }
    return this.idle;
  }
  get queueLength(): number {
    return this.queue.length + (this.cur ? 1 : 0);
  }
  get currentLabel(): string | null {
    return this.cur?.item.label ?? null;
  }
  get bodyMass(): number {
    return this.synth.athlete.bodyMass;
  }
  get externalLoadKg(): number {
    return this.load;
  }
  get simulatedDrops(): number {
    return this.droppedByImpair;
  }

  // ───────────── Verbindung ─────────────
  async connect(): Promise<void> {
    if (this._status.connection === 'connected') return;
    this.updateStatus({ connection: 'connecting' });
    this.updateStatus({ connection: 'connected', error: undefined, samplingHz: this.hz });
    if (this.o.clock === 'realtime') this.startTimer();
  }

  async disconnect(): Promise<void> {
    this.stopTimer();
    this.updateStatus({ connection: 'disconnected' });
  }

  override async setSamplingHz(hz: number): Promise<void> {
    await super.setSamplingHz(hz);
    this.hz = hz;
    this.producedAtStart = this.index;
    this.startedAtMs = this.nowMs();
  }

  private nowMs(): number {
    return this.o.now ? this.o.now() : typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private startTimer(): void {
    this.stopTimer();
    this.startedAtMs = this.nowMs();
    this.producedAtStart = this.index;
    this.timer = setInterval(() => {
      const elapsedS = ((this.nowMs() - this.startedAtMs) / 1000) * this.o.speed;
      const due = Math.floor(elapsedS * this.hz) - (this.index - this.producedAtStart);
      if (due > 0) this.generate(Math.min(due, Math.round(this.hz * 2)));
    }, this.o.batchMs);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ───────────── Steuerung des Athleten ─────────────
  setAthlete(patch: Partial<AthleteModel>): void {
    this.baseAthlete = { ...this.baseAthlete, ...patch };
    Object.assign(this.synth.athlete, patch);
  }

  /** Last aufnehmen/ablegen (Kraft steigt/fällt gleitend innerhalb 0,8 s). */
  setLoad(kg: number): void {
    if (kg === this.load) return;
    const m = this.bodyMass;
    const from = (m + this.load) * G;
    const to = (m + kg) * G;
    this.ensurePresence('standing');
    this.queue.push({
      profile: {
        kind: 'stand',
        duration: 0.8,
        stance: true,
        events: {},
        truth: {},
        force: (t) => from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t / 0.8))),
      },
      then: 'standing',
      label: `Last ${kg} kg`,
    });
    this.load = kg;
  }

  private planned(): 'empty' | 'standing' {
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i]!.then) return this.queue[i]!.then!;
    if (this.cur?.item.then) return this.cur.item.then;
    return this.idle;
  }

  private ensurePresence(state: 'empty' | 'standing'): void {
    const p = this.planned();
    if (state === 'standing' && p === 'empty') this.stepOn();
    if (state === 'empty' && p === 'standing') this.stepOff();
  }

  stepOn(): void {
    if (this.planned() === 'standing') return;
    this.queue.push({
      profile: stepOnProfile(this.bodyMass + this.load),
      then: 'standing',
      label: 'Auftreten',
    });
  }

  stepOff(): void {
    if (this.planned() === 'empty') return;
    this.queue.push({ profile: stepOffProfile(this.bodyMass + this.load), then: 'empty', label: 'Abtreten' });
    this.queue.push({ profile: emptyProfile(1.5), then: 'empty' });
  }

  /** Wartet (nur bei Echtzeit-Takt) bis die Warteschlange abgearbeitet ist. */
  whenIdle(): Promise<void> {
    if (!this.cur && !this.queue.length) return Promise.resolve();
    return new Promise((res) => this.idleWaiters.push(res));
  }

  clearQueue(): void {
    this.queue = [];
    this.cur = null;
  }

  private variation(): number {
    return Math.min(1.12, Math.max(0.88, 1 + 0.05 * this.rng.normal()));
  }

  /**
   * Spielt einen Versuch ab (Warteschlange): bei Bedarf wird zuerst auf-/abgetreten. Einbeinige Typen verlagern die
   * Last auf eine Platte, `failed_attempt` ist eine Gegenbewegung ohne Abheben.
   */
  perform(type: SimTrialType, p: TrialParams = {}): void {
    if (this._status.connection !== 'connected' && this.o.clock === 'realtime')
      throw new DeviceError('Simulator nicht verbunden', 'not_connected');
    const mass = this.bodyMass;
    const ability = (p.jumpHeightM ?? this.o.jumpAbility) * this.variation();
    const loaded = type === 'loaded_cmj' || type === 'loaded_sj';
    const loadKg = p.loadKg ?? (loaded ? 20 : this.load);
    const needsEmpty = type === 'dj' || type === 'sl_dj' || type === 'land_hold' || type === 'sl_land_hold';
    if (needsEmpty) this.ensurePresence('empty');
    else if (STANCE_TYPES.has(type) || STATIC_TYPES.has(type)) {
      this.ensurePresence('standing');
      if (loadKg !== this.load) this.setLoad(loadKg);
    }
    const sl = SINGLE_LEG_TYPES.has(type)
      ? ({ singleLeg: p.side ?? 'right' } as Partial<AthleteModel>)
      : undefined;
    const sys = mass + this.load;
    let trial: Profile[] = [];
    const then: 'standing' | 'empty' = 'standing';
    switch (type) {
      case 'cmj':
      case 'loaded_cmj':
      case 'abalakov':
        trial = jumpTrial({
          mass,
          loadKg: this.load,
          jumpHeight: ability * (loaded ? 0.68 : type === 'abalakov' ? 1.1 : 1),
        });
        break;
      case 'sj':
      case 'loaded_sj':
        trial = jumpTrial({
          mass,
          loadKg: this.load,
          jumpHeight: ability * (loaded ? 0.62 : 0.93),
          kind: 'sj',
        });
        break;
      case 'sl_jump':
        trial = jumpTrial({ mass, jumpHeight: ability * 0.55 });
        break;
      case 'cmrj':
      case 'sl_cmrj':
        trial = cmrjTrial({
          mass,
          jumpHeight: ability * (type === 'sl_cmrj' ? 0.55 : 0.95),
          reboundHeight: p.reboundHeightM ?? ability * (type === 'sl_cmrj' ? 0.45 : 0.78),
          contact: p.contactS ?? 0.24,
        });
        break;
      case 'hop':
      case 'sl_hop': {
        const n = p.hops ?? 10;
        const h = ability * (type === 'sl_hop' ? 0.34 : 0.42);
        const heights = Array.from({ length: n }, (_, i) =>
          i === 0 ? h * 0.55 : h * (0.92 + 0.16 * this.rng.next()),
        );
        trial = hopTrial({ mass, heights, contact: p.contactS ?? (type === 'sl_hop' ? 0.21 : 0.19) });
        break;
      }
      case 'sl_hop_return': {
        const h = ability * 0.3;
        trial = hopTrial({ mass, heights: [h * 0.6, h], contact: p.contactS ?? 0.21 });
        break;
      }
      case 'dj':
      case 'sl_dj':
        trial = djTrial({
          mass,
          dropHeight: p.dropHeightM ?? 0.3,
          jumpHeight: ability * (type === 'sl_dj' ? 0.5 : 0.8),
          contact: p.contactS ?? 0.2,
        });
        break;
      case 'land_hold':
      case 'sl_land_hold':
        trial = landHoldTrial({ mass, dropHeight: p.dropHeightM ?? 0.3 });
        break;
      case 'failed_attempt':
        trial = [abortedProfile(sys)];
        break;
      case 'isometric':
      case 'imtp':
      case 'iso_squat':
      case 'shoulder_iso_i':
      case 'shoulder_iso_y':
      case 'shoulder_iso_t': {
        const shoulder = type.startsWith('shoulder');
        const net =
          p.peakNetN ??
          (shoulder
            ? 160 + 40 * this.rng.next()
            : (type === 'imtp' ? 2.1 : 1.6) * sys * G * this.variation());
        trial = [
          isometricProfile({
            baselineN: sys * G,
            peakNetN: net,
            rise: p.riseS ?? (shoulder ? 1.4 : 0.9),
            hold: p.holdS ?? 2.5,
            lead: 1.0,
          }),
        ];
        break;
      }
      case 'quiet_stand':
      case 'sl_stand':
      case 'sl_range_of_stability': {
        const rs = type === 'sl_range_of_stability';
        const k = (p.unstable ? 2 : 1) * (type === 'quiet_stand' ? 1 : 1.6) * (rs ? 2.5 : 1);
        const sigma = p.sigmaMm ?? 6 * k;
        const center = sl ? plateCenterX(this.geometry, (p.side ?? 'right') as 'left' | 'right') : 0;
        trial = [
          balanceProfile({
            mass: sys,
            duration: p.durationS ?? 30,
            sigmaMl: sigma,
            sigmaAp: sigma * 1.5,
            tau: rs ? 2.2 : 1.2,
            centerX: center,
            rng: createRng(this.o.seed * 31 + this.index),
          }),
        ];
        break;
      }
      default:
        throw new DeviceError(`Simulator kann „${type}“ nicht abspielen`, 'unsupported');
    }
    const label = type;
    const hold = needsEmpty ? 1.8 : 1.5; // Ruhe/Haltephase nach dem Versuch (Land-and-Hold braucht ≥ 0,5 s Stabilisierung)
    if (sl) {
      // Drop-Typen beginnen auf leerer Platte (kein Vorab-Stand); alle anderen stehen zuerst einbeinig
      if (!needsEmpty)
        this.queue.push({
          profile: standProfile(mass, 1.2, this.load),
          override: sl,
          label: `${label} (Standwechsel)`,
        });
      trial.forEach((pr, i) =>
        this.queue.push({ profile: pr, override: sl, label: i === 0 ? label : undefined }),
      );
      this.queue.push({
        profile: standProfile(mass, hold, this.load),
        override: sl,
        then: 'standing',
        label: `${label} (Ruhe)`,
      });
    } else {
      trial.forEach((pr, i) =>
        this.queue.push({
          profile: pr,
          then: i === trial.length - 1 && !needsEmpty ? 'standing' : undefined,
          label: i === 0 ? label : undefined,
        }),
      );
      if (needsEmpty)
        this.queue.push({
          profile: standProfile(mass, hold, this.load),
          then: 'standing',
          label: `${label} (Ruhe)`,
        });
    }
    void then;
    void sys;
  }

  // ───────────── Sample-Erzeugung ─────────────
  /** Manueller Takt: erzeugt `ms` Millisekunden Daten und liefert sie an die Listener. Gibt die Anzahl Samples zurück. */
  advance(ms: number): number {
    const n = Math.round((ms * this.hz) / 1000);
    this.generate(n);
    return n;
  }

  private generate(n: number): void {
    const batchN = Math.max(1, Math.round((this.hz * this.o.batchMs) / 1000));
    let remaining = n;
    while (remaining > 0) {
      const k = Math.min(batchN, remaining);
      this.emitSamples(this.impair(this.produce(k)));
      remaining -= k;
    }
    if (this.index - this.lastBatteryEmit > this.hz * 5) {
      this.lastBatteryEmit = this.index;
      this.updateStatus({ batteryPct: Math.max(0, 87 - this.index / this.hz / 600) });
    }
    if (!this.cur && !this.queue.length && this.idleWaiters.length) {
      const w = this.idleWaiters.splice(0);
      for (const r of w) r();
    }
  }

  private nextItem(): void {
    this.cur = null;
    const item = this.queue.shift();
    if (!item) return;
    this.cur = { item, startIdx: this.index };
    Object.assign(this.synth.athlete, this.baseAthlete, item.override ?? {});
  }

  private produce(k: number): Sample[] {
    const out: Sample[] = [];
    const periodUs = 1e6 / this.hz;
    const bw = (this.bodyMass + this.load) * G;
    for (let j = 0; j < k; j++) {
      if (!this.cur) {
        this.nextItem();
        if (!this.cur) {
          // Rückkehr in den Ruhezustand (beidbeinig)
          Object.assign(this.synth.athlete, this.baseAthlete, { singleLeg: null });
        }
      }
      const t = this.index / this.hz;
      let force = 0;
      let stance = false;
      let env = 0;
      let cop: { x: number; y: number } | null = null;
      if (this.cur) {
        const local = (this.index - this.cur.startIdx) / this.hz;
        const p = this.cur.item.profile;
        force = p.force(Math.min(local, p.duration));
        stance = p.stance;
        env = stance ? stanceEnvelope(local, p.duration) : 0;
        if (p.cop) cop = p.cop(Math.min(local, p.duration));
        if (local + 1 / this.hz >= p.duration) {
          const done = this.cur.item;
          if (done.then) {
            this.idle = done.then;
            this.idleSince = this.index + 1;
          }
          this.cur = null;
          done.onDone?.();
        }
      } else if (this.idle === 'standing') {
        force = bw;
        stance = true;
        env = Math.min(1, (this.index - this.idleSince) / (0.3 * this.hz));
      }
      let s = this.synth.sample(force, t, env, stance);
      let corners: number[] | undefined;
      if (this.o.corners) {
        // Balance: Plattenaufteilung folgt dem ML-CoP (beidbeinig) bzw. der Einbeinvorgabe
        if (cop) {
          const a = this.synth.athlete;
          const cL = plateCenterX(this.geometry, 'left');
          const cR = plateCenterX(this.geometry, 'right');
          const shareL =
            a.singleLeg === 'left'
              ? 1
              : a.singleLeg === 'right'
                ? 0
                : Math.max(0, Math.min(1, (cR - cop.x) / (cR - cL)));
          s = { ...s, left: s.clean * shareL, right: s.clean * (1 - shareL) };
        }
        corners = cornersFor(s.left, s.right, cop, this.geometry, this.synth.athlete.noiseN, this.synth.rng);
        s = {
          ...s,
          left: corners[0]! + corners[1]! + corners[2]! + corners[3]!,
          right: corners[4]! + corners[5]! + corners[6]! + corners[7]!,
        };
      }
      const drift = (this.index / this.hz) * 0.02;
      const offL = this.offsets.left + drift;
      const offR = this.offsets.right - drift;
      out.push({
        t: this.index * periodUs,
        left: s.left + offL,
        right: s.right + offR,
        seq: this.index & 0xffff,
        corners: corners?.map((v, i) => v + (i < 4 ? offL : offR) / 4),
      });
      this.index++;
    }
    return out;
  }

  private impair(batch: Sample[]): Sample[] {
    const im = this.o.impair;
    if (!im) return batch;
    let out = batch;
    if (im.dropProb) {
      out = out.filter(() => {
        const drop = this.impairRng.next() < im.dropProb!;
        if (drop) this.droppedByImpair++;
        return !drop;
      });
    }
    if (im.timestampJitterUs)
      out = out.map((s) => ({ ...s, t: s.t + (this.impairRng.next() - 0.5) * 2 * im.timestampJitterUs! }));
    if (im.reorderProb) {
      out = [...out];
      for (let i = 0; i + 1 < out.length; i++)
        if (this.impairRng.next() < im.reorderProb) {
          const tmp = out[i]!;
          out[i] = out[i + 1]!;
          out[i + 1] = tmp;
          i++;
        }
    }
    return out;
  }
}
