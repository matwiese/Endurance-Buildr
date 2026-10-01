/**
 * Hardware-Abstraktion. Das Plattenprotokoll des Herstellers ist proprietär – hier wird nichts erfunden: echte Plattenanbindungen
 * implementieren `DeviceAdapter` (siehe docs/hardware-adapters.md); der Rest der App kennt nur dieses Interface.
 */
export interface Sample {
  /** Zeitstempel in µs (monoton, Geräteuhr bzw. Host-Empfangszeit) */
  t: number;
  /** Rohkraft linke/rechte Platte in N (ungenullt) */
  left: number;
  right: number;
  /** optionale Eckensensoren für CoP: [lFL, lFR, lBL, lBR, rFL, rFR, rBL, rBR] in N */
  corners?: readonly number[];
  /** optionale Paketnummer (Verlusterkennung) */
  seq?: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceStatus {
  connection: ConnectionState;
  /** Akkustand in % (null = unbekannt) */
  batteryPct: number | null;
  samplingHz: number;
  /** vom Adapter gemeldete Paketverluste (die Jitterbuffer-Statistik zählt zusätzlich unabhängig) */
  packetLoss: { lost: number; received: number };
  error?: string;
}

export interface DeviceInfo {
  /** Adaptertyp, z. B. 'simulator' | 'file-replay' | 'websocket' */
  kind: string;
  name: string;
  serial: string;
  plates: 1 | 2;
  supportedHz: readonly number[];
  hasCorners: boolean;
  /** Plattengeometrie für CoP (mm) */
  geometry?: { widthMm: number; lengthMm: number; gapMm: number };
}

export type Unsubscribe = () => void;
export type SampleListener = (samples: readonly Sample[]) => void;
export type StatusListener = (status: DeviceStatus) => void;

export interface DeviceAdapter {
  readonly info: DeviceInfo;
  readonly status: DeviceStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Hardware-Tara anfordern. Adapter ohne Hardware-Tara lösen sofort auf – die Software-Nullung (core/zero) gilt immer. */
  zero(): Promise<void>;
  setSamplingHz(hz: number): Promise<void>;
  /** Abtastwert-Batches (z. B. alle 10–16 ms) */
  onSample(cb: SampleListener): Unsubscribe;
  onStatus(cb: StatusListener): Unsubscribe;
}

export class DeviceError extends Error {
  constructor(
    message: string,
    readonly code: 'not_connected' | 'unsupported' | 'protocol' | 'transport' = 'transport',
  ) {
    super(message);
    this.name = 'DeviceError';
  }
}

/** Basisklasse mit Listener-Verwaltung und Statusfortschreibung. */
export abstract class BaseAdapter implements DeviceAdapter {
  abstract readonly info: DeviceInfo;
  private sampleListeners = new Set<SampleListener>();
  private statusListeners = new Set<StatusListener>();
  protected _status: DeviceStatus = {
    connection: 'disconnected',
    batteryPct: null,
    samplingHz: 1000,
    packetLoss: { lost: 0, received: 0 },
  };

  get status(): DeviceStatus {
    return this._status;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  async zero(): Promise<void> {
    // kein Hardware-Tara
  }

  async setSamplingHz(hz: number): Promise<void> {
    if (!this.info.supportedHz.includes(hz))
      throw new DeviceError(`Abtastrate ${hz} Hz wird nicht unterstützt`, 'unsupported');
    this.updateStatus({ samplingHz: hz });
  }

  onSample(cb: SampleListener): Unsubscribe {
    this.sampleListeners.add(cb);
    return () => this.sampleListeners.delete(cb);
  }

  onStatus(cb: StatusListener): Unsubscribe {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  protected emitSamples(samples: readonly Sample[]): void {
    if (!samples.length) return;
    for (const l of this.sampleListeners) l(samples);
  }

  protected updateStatus(patch: Partial<DeviceStatus>): void {
    this._status = { ...this._status, ...patch };
    for (const l of this.statusListeners) l(this._status);
  }
}
