import { analyzeRecording, type AnalyzeOptions, type ForceTrace, type RecordingAnalysis } from '@buildr/core';
import { useLive } from '../state/live.ts';

/** Analyse über den Worker (falls verbunden), sonst direkt im Hauptthread (rein, deterministisch). */
export async function analyzeViaEngine(
  trace: ForceTrace,
  options: AnalyzeOptions,
): Promise<RecordingAnalysis> {
  const engine = useLive.getState().engine;
  if (engine) {
    try {
      return await engine.analyze(trace, options);
    } catch {
      /* Worker nicht erreichbar → lokal */
    }
  }
  return analyzeRecording(trace, options);
}
