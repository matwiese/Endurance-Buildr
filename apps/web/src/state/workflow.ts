import {
  ANALYSIS_VERSION,
  type ProfileDTO,
  type RecordingRecord,
  type RepRecord,
  type TestConditions,
  type TestRecord,
} from '@buildr/shared';
import {
  type AnalyzeOptions,
  type Recording,
  type RecordingAnalysis,
  type RepResult,
  type TestType,
  type ForceTrace,
} from '@buildr/core';
import { create } from 'zustand';
import { uid } from '../lib/uid.ts';
import { localRepo } from '../offline/repo.ts';
import { useAuth } from './auth.ts';

export type StepId = 'connect' | 'testType' | 'profile' | 'zero' | 'weigh' | 'record' | 'review' | 'save';
export const STEPS: StepId[] = [
  'connect',
  'testType',
  'profile',
  'zero',
  'weigh',
  'record',
  'review',
  'save',
];

export interface ReviewRep extends RepResult {
  key: string;
  removed: boolean;
  manual?: boolean;
}

export type AnalyzeFn = (trace: ForceTrace, options: AnalyzeOptions) => Promise<RecordingAnalysis>;

const toReview = (reps: RepResult[]): ReviewRep[] => reps.map((r) => ({ ...r, key: uid(), removed: false }));

interface WorkflowStore {
  step: StepId;
  mode: 'auto' | TestType;
  externalLoadKg: number;
  tagIds: string[];
  conditions: TestConditions;
  profile: ProfileDTO | null;
  guest: boolean;
  sessionId: string | null;
  recording: Recording | null;
  analysis: RecordingAnalysis | null;
  reps: ReviewRep[];
  selectedKey: string | null;
  undo: ReviewRep[][];
  busy: boolean;
  saved: TestRecord[];
  saveError: string | null;
  deviceSerial: string | null;

  setStep: (s: StepId) => void;
  setMode: (m: 'auto' | TestType) => void;
  setLoad: (kg: number) => void;
  toggleTag: (id: string) => void;
  setConditions: (c: TestConditions) => void;
  setProfile: (p: ProfileDTO | null) => void;
  setGuest: (g: boolean) => void;
  setSession: (id: string | null) => void;
  setDeviceSerial: (s: string | null) => void;
  finishRecording: (rec: Recording, analysis: RecordingAnalysis) => void;
  select: (key: string | null) => void;
  toggleInclude: (key: string) => void;
  deleteRep: (key: string) => void;
  undoLast: () => void;
  relabel: (
    key: string,
    type: TestType,
    analyze: AnalyzeFn,
    config: AnalyzeOptions['config'],
  ) => Promise<void>;
  addRange: (
    start: number,
    end: number,
    type: TestType,
    analyze: AnalyzeFn,
    config: AnalyzeOptions['config'],
  ) => Promise<number>;
  selectBestN: (blockIndex: number, n: number, metricKey: string) => void;
  save: () => Promise<TestRecord[]>;
  resetForNextTest: () => void;
  resetAll: () => void;
}

const INITIAL = {
  step: 'connect' as StepId,
  mode: 'auto' as 'auto' | TestType,
  externalLoadKg: 0,
  tagIds: [] as string[],
  conditions: {} as TestConditions,
  profile: null as ProfileDTO | null,
  guest: false,
  sessionId: null as string | null,
  recording: null as Recording | null,
  analysis: null as RecordingAnalysis | null,
  reps: [] as ReviewRep[],
  selectedKey: null as string | null,
  undo: [] as ReviewRep[][],
  busy: false,
  saved: [] as TestRecord[],
  saveError: null as string | null,
  deviceSerial: null as string | null,
};

export const useWorkflow = create<WorkflowStore>((set, get) => ({
  ...INITIAL,

  setStep: (step) => set({ step }),
  setMode: (mode) => set({ mode }),
  setLoad: (externalLoadKg) => set({ externalLoadKg: Math.max(0, externalLoadKg) }),
  toggleTag: (id) =>
    set((s) => ({ tagIds: s.tagIds.includes(id) ? s.tagIds.filter((x) => x !== id) : [...s.tagIds, id] })),
  setConditions: (conditions) => set({ conditions }),
  setProfile: (profile) => set({ profile, guest: false }),
  setGuest: (guest) => set({ guest, profile: guest ? null : get().profile }),
  setSession: (sessionId) => set({ sessionId }),
  setDeviceSerial: (deviceSerial) => set({ deviceSerial }),

  finishRecording: (recording, analysis) => {
    const reps = toReview(analysis.reps);
    set({
      recording,
      analysis,
      reps,
      selectedKey: reps[0]?.key ?? null,
      undo: [],
      saved: [],
      saveError: null,
      step: 'review',
    });
  },

  select: (selectedKey) => set({ selectedKey }),

  toggleInclude: (key) => {
    set((s) => ({
      undo: [...s.undo, s.reps],
      reps: s.reps.map((r) => (r.key === key ? { ...r, included: !r.included } : r)),
    }));
  },

  deleteRep: (key) => {
    set((s) => {
      const reps = s.reps.map((r) => (r.key === key ? { ...r, removed: true } : r));
      const sel = s.selectedKey === key ? (reps.find((r) => !r.removed)?.key ?? null) : s.selectedKey;
      return { undo: [...s.undo, s.reps], reps, selectedKey: sel };
    });
  },

  undoLast: () => {
    set((s) => {
      const prev = s.undo[s.undo.length - 1];
      return prev ? { reps: prev, undo: s.undo.slice(0, -1) } : s;
    });
  },

  relabel: async (key, type, analyze, config) => {
    const { reps, recording, analysis } = get();
    const rep = reps.find((r) => r.key === key);
    if (!rep || !recording || !analysis) return;
    const group = reps.filter((r) => r.blockIndex === rep.blockIndex && !r.removed);
    const start = Math.min(...group.map((r) => r.startIdx));
    const end = Math.max(...group.map((r) => r.endIdx));
    set({ busy: true });
    try {
      const res = await analyze(recording.trace, {
        mode: type,
        range: { start, end },
        bodyMassKg: analysis.bodyMassKg ?? undefined,
        externalLoadKg: analysis.externalLoadKg,
        config,
      });
      const fresh = toReview(res.reps).map((r) => ({ ...r, blockIndex: rep.blockIndex }));
      set((s) => {
        const out: ReviewRep[] = [];
        let inserted = false;
        for (const r of s.reps) {
          if (r.blockIndex === rep.blockIndex && !r.removed) {
            if (!inserted) {
              out.push(...fresh);
              inserted = true;
            }
          } else out.push(r);
        }
        return { undo: [...s.undo, s.reps], reps: out, selectedKey: fresh[0]?.key ?? s.selectedKey };
      });
    } finally {
      set({ busy: false });
    }
  },

  addRange: async (start, end, type, analyze, config) => {
    const { recording, analysis, reps } = get();
    if (!recording || !analysis) return 0;
    set({ busy: true });
    try {
      const res = await analyze(recording.trace, {
        mode: type,
        range: {
          start: Math.max(0, Math.floor(start)),
          end: Math.min(recording.trace.left.length, Math.ceil(end)),
        },
        bodyMassKg: analysis.bodyMassKg ?? undefined,
        externalLoadKg: analysis.externalLoadKg,
        config,
      });
      const block = Math.max(-1, ...reps.map((r) => r.blockIndex)) + 1;
      const fresh = toReview(res.reps).map((r) => ({ ...r, blockIndex: block, manual: true }));
      set((s) => ({
        undo: [...s.undo, s.reps],
        reps: [...s.reps, ...fresh].sort((a, b) => a.startIdx - b.startIdx),
        selectedKey: fresh[0]?.key ?? s.selectedKey,
      }));
      return fresh.length;
    } finally {
      set({ busy: false });
    }
  },

  selectBestN: (blockIndex, n, metricKey) => {
    set((s) => {
      const cand = s.reps.filter((r) => r.blockIndex === blockIndex && !r.removed && !r.leadIn);
      const ranked = [...cand].sort(
        (a, b) => (b.metrics[metricKey] ?? -Infinity) - (a.metrics[metricKey] ?? -Infinity),
      );
      const keep = new Set(ranked.slice(0, n).map((r) => r.key));
      return {
        undo: [...s.undo, s.reps],
        reps: s.reps.map((r) => (cand.includes(r) ? { ...r, included: keep.has(r.key) } : r)),
      };
    });
  },

  save: async () => {
    const s = get();
    if (!s.recording || !s.analysis) return [];
    const included = s.reps.filter((r) => r.included && !r.removed && !r.leadIn);
    if (!included.length) {
      set({ saveError: 'nothing' });
      return [];
    }
    if (included.some((r) => r.type === 'unclear')) {
      set({ saveError: 'unclear' });
      return [];
    }
    set({ busy: true, saveError: null });
    try {
      const now = new Date().toISOString();
      const rec: RecordingRecord = {
        id: uid(),
        hz: s.recording.trace.hz,
        left: Float32Array.from(s.recording.trace.left),
        right: Float32Array.from(s.recording.trace.right),
        copX: s.recording.trace.copX ? Float32Array.from(s.recording.trace.copX) : undefined,
        copY: s.recording.trace.copY ? Float32Array.from(s.recording.trace.copY) : undefined,
        breaks: s.recording.trace.breaks ?? [],
        createdAt: now,
      };
      await localRepo.recordings.put(rec);
      // Reps nach Typ gruppieren: ein Test je Typ (alle Tests teilen sich die Aufnahme)
      const byType = new Map<TestType, ReviewRep[]>();
      for (const r of s.reps.filter((x) => !x.removed)) {
        if (r.type === 'unclear') continue;
        const arr = byType.get(r.type) ?? [];
        arr.push(r);
        byType.set(r.type, arr);
      }
      const tests: TestRecord[] = [];
      for (const [type, list] of byType) {
        if (!list.some((r) => r.included && !r.leadIn)) continue;
        const test: TestRecord = {
          id: uid(),
          profileId: s.profile?.id ?? null,
          sessionId: s.sessionId,
          testType: type,
          detectedType: s.mode === 'auto' ? (list[0]!.detectedType ?? type) : null,
          bodyMassKg: s.analysis.bodyMassKg,
          externalLoadKg: s.recording.externalLoadKg,
          samplingHz: s.recording.trace.hz,
          deviceSerial: s.deviceSerial,
          createdAt: now,
          status: 'queued',
          tagIds: [...s.tagIds],
          conditions: { ...s.conditions },
          recordingId: rec.id,
          zeroOffsets: { left: s.recording.offsetLeft, right: s.recording.offsetRight },
          notes: null,
          analysisVersion: ANALYSIS_VERSION,
          reps: list.map((r, i): RepRecord => ({
            id: uid(),
            index: i,
            startIdx: r.startIdx,
            endIdx: r.endIdx,
            included: r.included,
            type: r.type,
            confidence: r.confidence,
            side: r.side,
            events: r.events,
            metrics: r.metrics,
            warnings: r.warnings,
            leadIn: r.leadIn,
            hopIndex: r.hopIndex,
          })),
        };
        // lokaler Modus (ohne Server): kein Upload vorgesehen
        const server = useAuth.getState().status !== 'local';
        await localRepo.tests.put(server ? test : { ...test, status: 'local' });
        if (server) await localRepo.outbox.add('test', test.id);
        tests.push(test);
      }
      set({ saved: tests });
      return tests;
    } catch (e) {
      set({ saveError: String(e) });
      return [];
    } finally {
      set({ busy: false });
    }
  },

  /** Nächster Test mit gleichem Athleten: Auswahl bleibt, Review/Live-Daten werden verworfen. */
  resetForNextTest: () =>
    set({
      recording: null,
      analysis: null,
      reps: [],
      selectedKey: null,
      undo: [],
      saved: [],
      saveError: null,
      step: 'testType',
      tagIds: get().tagIds,
    }),

  resetAll: () => set({ ...INITIAL }),
}));
