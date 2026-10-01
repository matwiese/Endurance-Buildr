import type { AnalysisWarning, LiveEvent, LivePhase, RepResult, WeighState } from '@buildr/core';
import {
  FileReplayAdapter,
  SimulatorAdapter,
  type ConnectionState,
  type DeviceAdapter,
  type SimulatorOptions,
} from '@buildr/device';
import { create } from 'zustand';
import { LiveEngine, type EngineEvent } from '../live/engine.ts';
import type { LiveMarker } from '../plot/LivePlot.tsx';
import { analysisConfigFrom, useSettings } from './settings.ts';
import type { TestType } from '@buildr/core';

export type AdapterKind = 'simulator' | 'replay' | 'custom';

interface LiveStore {
  engine: LiveEngine | null;
  simulator: SimulatorAdapter | null;
  adapterKind: AdapterKind | null;
  adapterName: string | null;
  connection: ConnectionState;
  batteryPct: number | null;
  hz: number;
  phase: LivePhase;
  zero: { ok: boolean | null; left: number; right: number; reason: string | null; running: boolean };
  weigh: WeighState | null;
  massKg: number | null;
  massSource: 'weighed' | 'manual' | 'estimated' | null;
  markers: LiveMarker[];
  liveReps: RepResult[];
  liveWarnings: AnalysisWarning[];
  progressS: number;
  latencyMs: number;
  lossPct: number;
  errorCode: string | null;
  /** Simulator: Sprungvermögen (m) des gerade simulierten Athleten (Gruppentest: je Athlet), null = Standard */
  simAbilityM: number | null;
  setSimAbility: (m: number | null) => void;

  connectSimulator: (o: {
    hz: number;
    mode: 'auto' | TestType;
    load: number;
    speed?: number;
  }) => Promise<void>;
  connectReplay: (csv: string, name: string, o: { mode: 'auto' | TestType; speed?: number }) => Promise<void>;
  /** Beliebigen `DeviceAdapter` (eigener Plattentreiber, siehe docs/hardware-adapters.md) verbinden. */
  connectAdapter: (adapter: DeviceAdapter, o: { mode: 'auto' | TestType; load: number }) => Promise<void>;
  disconnect: () => Promise<void>;
  configure: (mode: 'auto' | TestType, load: number) => void;
  startZero: () => void;
  rezero: () => void;
  startWeigh: () => void;
  cancelWeigh: () => void;
  lockWeight: () => Promise<number | null>;
  setMass: (kg: number | null) => void;
  startRecording: () => Promise<boolean>;
  resetRecordingState: () => void;
  clearError: () => void;
}

const INITIAL = {
  simAbilityM: null as number | null,
  engine: null,
  simulator: null,
  adapterKind: null,
  adapterName: null,
  connection: 'disconnected' as ConnectionState,
  batteryPct: null,
  hz: 1000,
  phase: 'idle' as LivePhase,
  zero: { ok: null, left: 0, right: 0, reason: null, running: false },
  weigh: null,
  massKg: null,
  massSource: null,
  markers: [] as LiveMarker[],
  liveReps: [] as RepResult[],
  liveWarnings: [] as AnalysisWarning[],
  progressS: 0,
  latencyMs: 0,
  lossPct: 0,
  errorCode: null as string | null,
};

export const useLive = create<LiveStore>((set, get) => {
  const onEvent = (e: EngineEvent) => {
    if (e.type === 'status')
      return void set({
        connection: e.status.connection,
        batteryPct: e.status.batteryPct,
        hz: e.status.samplingHz,
      });
    if (e.type === 'stats') return void set({ latencyMs: e.stats.latencyMs, lossPct: e.stats.lossPct });
    handleLive(e.e);
  };
  const handleLive = (e: LiveEvent) => {
    switch (e.type) {
      case 'phase':
        set({ phase: e.phase });
        break;
      case 'zero':
        set({
          zero: e.ok
            ? { ok: true, left: e.offsetLeft, right: e.offsetRight, reason: null, running: false }
            : { ...get().zero, ok: get().zero.ok, reason: e.reason, running: false },
        });
        break;
      case 'weigh':
        set({ weigh: e.state });
        break;
      case 'weight':
        set({ massKg: e.massKg, massSource: e.source });
        break;
      case 'marker':
        if (e.ringIdx !== undefined)
          set((s) => ({ markers: [...s.markers.slice(-200), { kind: e.kind, ringIdx: e.ringIdx! }] }));
        break;
      case 'reps':
        set((s) => ({ liveReps: [...s.liveReps, ...e.reps], liveWarnings: e.warnings }));
        break;
      case 'progress':
        set({ progressS: e.seconds });
        break;
      case 'error':
        set({ errorCode: e.code });
        break;
    }
  };

  const attach = (
    adapter: DeviceAdapter,
    kind: AdapterKind,
    name: string,
    mode: 'auto' | TestType,
    load: number,
    simulator: SimulatorAdapter | null,
  ) => {
    const st = useSettings.getState();
    const engine = new LiveEngine(adapter, {
      mode,
      externalLoadKg: load,
      config: analysisConfigFrom(st),
      reorderWindowUs: 20_000,
      deviceBatchMs: 10,
    });
    engine.subscribe(onEvent);
    set({
      ...INITIAL,
      engine,
      simulator,
      adapterKind: kind,
      adapterName: name,
      hz: adapter.status.samplingHz,
      connection: adapter.status.connection,
    });
    return engine;
  };

  return {
    ...INITIAL,

    connectSimulator: async ({ hz, mode, load, speed }) => {
      await get().disconnect();
      const st = useSettings.getState();
      const sim: SimulatorOptions = {
        hz,
        speed: speed ?? 1,
        seed: Math.floor(Date.now() % 100000),
        athlete: {
          bodyMass: st.simulator.bodyMass,
          asymmetry: st.simulator.asymmetryPct / 100,
          noiseN: st.simulator.noiseN,
        },
        jumpAbility: st.simulator.jumpAbilityCm / 100,
        corners: true,
      };
      const adapter = new SimulatorAdapter(sim);
      const engine = attach(adapter, 'simulator', adapter.info.name, mode, load, adapter);
      await engine.connect();
    },

    connectReplay: async (csv, name, o) => {
      await get().disconnect();
      const adapter = FileReplayAdapter.fromCsv(csv, { speed: o.speed ?? 1, name });
      const engine = attach(adapter, 'replay', name, o.mode, 0, null);
      await engine.connect();
      if (adapter.weightKg) get().engine?.setMass(adapter.weightKg, 'manual');
    },

    connectAdapter: async (adapter, o) => {
      await get().disconnect();
      const engine = attach(adapter, 'custom', adapter.info.name, o.mode, o.load, null);
      try {
        await engine.connect();
      } catch (e) {
        await get().disconnect();
        throw e;
      }
    },

    disconnect: async () => {
      const { engine } = get();
      if (engine) {
        await engine.disconnect().catch(() => undefined);
        engine.dispose();
      }
      set({ ...INITIAL });
    },

    setSimAbility: (m) => set({ simAbilityM: m }),
    configure: (mode, load) => get().engine?.configure({ mode, externalLoadKg: load }),
    startZero: () => {
      set((s) => ({ zero: { ...s.zero, running: true, reason: null } }));
      get().engine?.startZero();
    },
    rezero: () => {
      set((s) => ({ zero: { ...s.zero, running: true, reason: null } }));
      get().engine?.rezero();
    },
    startWeigh: () => {
      set({ weigh: null });
      get().engine?.startWeigh();
    },
    cancelWeigh: () => get().engine?.cancelWeigh(),
    lockWeight: async () => (await get().engine?.lockWeight()) ?? null,
    setMass: (kg) => {
      get().engine?.setMass(kg);
      set({ massKg: kg, massSource: kg === null ? null : 'manual' });
    },
    startRecording: async () => {
      set({ markers: [], liveReps: [], liveWarnings: [], progressS: 0, errorCode: null });
      return (await get().engine?.startRecording()) ?? false;
    },
    resetRecordingState: () => set({ markers: [], liveReps: [], liveWarnings: [], progressS: 0 }),
    clearError: () => set({ errorCode: null }),
  };
});
