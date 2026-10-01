import {
  DEFAULT_TILE_METRICS,
  type AnalysisConfig,
  type DeepPartial,
  type TestType,
  type UnitSystem,
} from '@buildr/core';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Lang } from '../i18n/index.ts';

export interface SimulatorSettings {
  bodyMass: number;
  asymmetryPct: number;
  jumpAbilityCm: number;
  noiseN: number;
}

export interface Settings {
  lang: Lang;
  unitSystem: UnitSystem;
  theme: 'dark' | 'light';
  tileMetrics: Partial<Record<TestType, string[]>>;
  hopBestN: number;
  isoOnset: 'yank' | 'sd5';
  takeoffCorrection: boolean;
  plotWindowS: number;
  defaultHz: 200 | 500 | 1000;
  simulator: SimulatorSettings;
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  setSimulator: (patch: Partial<SimulatorSettings>) => void;
  setTiles: (type: TestType, keys: string[]) => void;
  resetTiles: (type: TestType) => void;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'de',
  unitSystem: 'metric',
  theme: 'dark',
  tileMetrics: {},
  hopBestN: 5,
  isoOnset: 'yank',
  takeoffCorrection: true,
  plotWindowS: 10,
  defaultHz: 1000,
  simulator: { bodyMass: 82, asymmetryPct: 0, jumpAbilityCm: 38, noiseN: 1 },
};

const safeStorage = {
  getItem: (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string): void => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* Speicher gesperrt (privates Fenster): Einstellungen gelten nur für diese Sitzung */
    }
  },
  removeItem: (k: string): void => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignorieren */
    }
  },
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      setSimulator: (patch) => set((s) => ({ simulator: { ...s.simulator, ...patch } })),
      setTiles: (type, keys) => set((s) => ({ tileMetrics: { ...s.tileMetrics, [type]: keys } })),
      resetTiles: (type) =>
        set((s) => {
          const next = { ...s.tileMetrics };
          delete next[type];
          return { tileMetrics: next };
        }),
    }),
    { name: 'buildr.settings.v1', storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);

export const tilesFor = (s: Pick<Settings, 'tileMetrics'>, type: TestType): string[] =>
  s.tileMetrics[type] ?? DEFAULT_TILE_METRICS[type];

/** Analyse-Konfiguration aus den Einstellungen (nur Abweichungen vom Standard). */
export function analysisConfigFrom(
  s: Pick<Settings, 'hopBestN' | 'isoOnset' | 'takeoffCorrection'>,
): DeepPartial<AnalysisConfig> {
  return {
    hop: { bestN: s.hopBestN },
    isoOnset: { method: s.isoOnset },
    kinematics: { takeoffCorrection: s.takeoffCorrection },
  };
}
