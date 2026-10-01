import {
  analyzeRecording,
  jumpTrial,
  renderScript,
  standProfile,
  withRest,
  type Recording,
  type RecordingAnalysis,
} from '@buildr/core';

/** Aufnahme mit mehreren CMJs (und optional einem SJ) aus dem Simulator-Synthesizer + deren Analyse. */
export function makeRecording(
  opts: { cmj?: number; sj?: number; mass?: number; hz?: number; seed?: number } = {},
): { recording: Recording; analysis: RecordingAnalysis } {
  const mass = opts.mass ?? 80;
  const hz = opts.hz ?? 1000;
  const base = { mass };
  const profiles = [standProfile(mass, 1.5)];
  for (let i = 0; i < (opts.cmj ?? 3); i++)
    profiles.push(...withRest(base, jumpTrial({ ...base, jumpHeight: 0.3 + 0.02 * i }), 0.1, 2));
  for (let i = 0; i < (opts.sj ?? 0); i++)
    profiles.push(...withRest(base, jumpTrial({ ...base, jumpHeight: 0.28, kind: 'sj' }), 0.1, 2));
  const r = renderScript(profiles, { hz, seed: opts.seed ?? 3, athlete: { bodyMass: mass } });
  const recording: Recording = {
    trace: r.trace,
    offsetLeft: 0,
    offsetRight: 0,
    bodyMassKg: mass,
    massSource: 'weighed',
    externalLoadKg: 0,
  };
  const analysis = analyzeRecording(r.trace, { mode: 'auto', bodyMassKg: mass });
  return { recording, analysis };
}
