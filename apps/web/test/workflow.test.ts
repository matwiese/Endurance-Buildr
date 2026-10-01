import { analyzeRecording } from '@buildr/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { localRepo } from '../src/offline/repo.ts';
import { useWorkflow, type AnalyzeFn } from '../src/state/workflow.ts';
import { makeRecording } from './fixtures.ts';

const analyze: AnalyzeFn = async (trace, options) => analyzeRecording(trace, options);
const wf = () => useWorkflow.getState();

describe('Workflow-Store (Review, Relabel, Bereich, Speichern)', () => {
  beforeEach(() => wf().resetAll());

  it('finishRecording übernimmt die Wiederholungen und wählt die erste', () => {
    const { recording, analysis } = makeRecording({ cmj: 3 });
    wf().finishRecording(recording, analysis);
    expect(wf().step).toBe('review');
    expect(wf().reps.filter((r) => r.type === 'cmj').length).toBe(3);
    expect(wf().selectedKey).toBe(wf().reps[0]!.key);
  });

  it('Einschließen/Löschen/Rückgängig', () => {
    const { recording, analysis } = makeRecording({ cmj: 3 });
    wf().finishRecording(recording, analysis);
    const [a, b] = wf().reps;
    wf().toggleInclude(a!.key);
    expect(wf().reps[0]!.included).toBe(!a!.included);
    wf().select(b!.key);
    wf().deleteRep(b!.key);
    expect(wf().reps.find((r) => r.key === b!.key)!.removed).toBe(true);
    expect(wf().selectedKey).not.toBe(b!.key);
    wf().undoLast();
    expect(wf().reps.find((r) => r.key === b!.key)!.removed).toBe(false);
    wf().undoLast();
    expect(wf().reps[0]!.included).toBe(a!.included);
    expect(wf().undo).toHaveLength(0);
  });

  it('Umbenennen (Relabel) analysiert den Block neu mit dem gewählten Typ', async () => {
    const { recording, analysis } = makeRecording({ cmj: 2 });
    wf().finishRecording(recording, analysis);
    const first = wf().reps[0]!;
    await wf().relabel(first.key, 'sj', analyze, undefined);
    const after = wf().reps.filter((r) => !r.removed);
    expect(after[0]!.type).toBe('sj');
    expect(after.length).toBe(wf().reps.length);
    expect(wf().busy).toBe(false);
    expect(wf().undo).toHaveLength(1);
  });

  it('Bereich markieren: neue Rep(s) werden mit manual-Flag einsortiert', async () => {
    const { recording, analysis } = makeRecording({ cmj: 2 });
    wf().finishRecording(recording, analysis);
    const r0 = wf().reps[0]!;
    const n = await wf().addRange(r0.startIdx - 500, r0.endIdx + 500, 'cmj', analyze, undefined);
    expect(n).toBeGreaterThan(0);
    const manual = wf().reps.filter((r) => r.manual);
    expect(manual.length).toBe(n);
    expect(manual[0]!.blockIndex).toBeGreaterThan(r0.blockIndex);
    const idx = wf().reps.map((r) => r.startIdx);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it('Speichern: ein Test je Typ, gemeinsame Aufnahme, Outbox-Einträge', async () => {
    const { recording, analysis } = makeRecording({ cmj: 2, sj: 1 });
    wf().finishRecording(recording, analysis);
    wf().setProfile({ id: 'p1' } as never);
    const saved = await wf().save();
    const types = saved.map((t) => t.testType).sort();
    expect(types).toEqual(['cmj', 'sj']);
    expect(new Set(saved.map((t) => t.recordingId)).size).toBe(1);
    const cmj = saved.find((t) => t.testType === 'cmj')!;
    expect(cmj.reps.length).toBe(2);
    expect(cmj.status).toBe('queued');
    expect(cmj.profileId).toBe('p1');
    expect(await localRepo.tests.get(cmj.id)).toBeTruthy();
    expect(await localRepo.recordings.get(cmj.recordingId!)).toBeTruthy();
    const ids = (await localRepo.outbox.list()).map((o) => o.entityId);
    expect(ids).toEqual(expect.arrayContaining(saved.map((t) => t.id)));
  });

  it('Speichern verweigert unklare Reps und leere Auswahl', async () => {
    const { recording, analysis } = makeRecording({ cmj: 1 });
    wf().finishRecording(recording, analysis);
    for (const r of wf().reps) wf().toggleInclude(r.key);
    expect(await wf().save()).toEqual([]);
    expect(wf().saveError).toBe('nothing');
  });

  it('Nächster Test: Auswahl bleibt, Review-Daten sind weg', () => {
    const { recording, analysis } = makeRecording({ cmj: 1 });
    wf().setProfile({ id: 'p1' } as never);
    wf().toggleTag('t1');
    wf().finishRecording(recording, analysis);
    wf().resetForNextTest();
    expect(wf()).toMatchObject({ reps: [], recording: null, step: 'testType', tagIds: ['t1'] });
    expect(wf().profile?.id).toBe('p1');
  });
});
