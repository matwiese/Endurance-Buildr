import type {
  AnalysisConfig,
  AnalyzeOptions,
  DeepPartial,
  ForceTrace,
  LiveEvent,
  Recording,
  RecordingAnalysis,
  TestType,
} from '@buildr/core';

/** Nachrichten Hauptthread → Worker */
export type ToWorker =
  | {
      type: 'init';
      hz: number;
      mode: 'auto' | TestType;
      externalLoadKg: number;
      config?: DeepPartial<AnalysisConfig>;
    }
  | {
      type: 'configure';
      mode?: 'auto' | TestType;
      externalLoadKg?: number;
      config?: DeepPartial<AnalysisConfig>;
    }
  | {
      type: 'push';
      left: Float32Array;
      right: Float32Array;
      corners?: Float32Array;
      breakBefore?: boolean;
      tag?: number;
    }
  | { type: 'startZero' }
  | { type: 'rezero' }
  | { type: 'startWeigh' }
  | { type: 'cancelWeigh' }
  | { type: 'lockWeight'; reqId: number }
  | { type: 'setMass'; kg: number | null; source?: 'manual' | 'weighed' }
  | { type: 'startRecording'; reqId: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop'; reqId: number }
  | { type: 'analyze'; reqId: number; trace: ForceTrace; options: AnalyzeOptions };

/** Nachrichten Worker → Hauptthread */
export type FromWorker =
  | { type: 'event'; e: LiveEvent }
  | { type: 'locked'; reqId: number; kg: number | null }
  | { type: 'recordingStarted'; reqId: number; ok: boolean }
  | { type: 'stopped'; reqId: number; result: { recording: Recording; analysis: RecordingAnalysis } | null }
  | { type: 'analysis'; reqId: number; analysis: RecordingAnalysis };

export interface WorkerLike {
  postMessage(msg: ToWorker, transfer?: Transferable[]): void;
  onmessage: ((ev: { data: FromWorker }) => void) | null;
  terminate(): void;
}
