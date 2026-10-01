import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StepReview } from '../src/pages/test/StepReview.tsx';
import { repAnnotations, repPhaseRegions } from '../src/lib/repDetail.ts';
import { useSettings } from '../src/state/settings.ts';
import { useWorkflow } from '../src/state/workflow.ts';
import { makeRecording } from './fixtures.ts';

const setup = (opts: Parameters<typeof makeRecording>[0] = {}) => {
  const { recording, analysis } = makeRecording(opts);
  useWorkflow.getState().finishRecording(recording, analysis);
  const onNext = vi.fn();
  const onAgain = vi.fn();
  render(<StepReview onNext={onNext} onAgain={onAgain} />);
  return { recording, analysis, onNext, onAgain };
};

describe('StepReview', () => {
  beforeEach(() => {
    useWorkflow.getState().resetAll();
    useSettings.setState({ lang: 'de' });
  });

  it('zeigt alle erkannten Wiederholungen mit Typ und Konfidenz, kennzahlen der gewählten Rep und Zusammenfassung', () => {
    setup({ cmj: 3 });
    const list = screen.getByTestId('rep-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getAllByText(/Gegenbewegungssprung/).length).toBe(3);
    expect(screen.getAllByText(/Sprunghöhe \(Imp-Mom\)/).length).toBeGreaterThan(0);
    // Zusammenfassung erst ab 2 Wiederholungen des gleichen Typs
    expect(screen.getByText(/Zusammenfassung/)).toBeInTheDocument();
    expect(screen.getByTestId('trace-plot')).toBeInTheDocument();
  });

  it('Rep abwählen/löschen verändert die Auswahl; „Weiter“ ist ohne eingeschlossene Rep gesperrt', async () => {
    const user = userEvent.setup();
    const { onNext } = setup({ cmj: 1 });
    const next = screen.getByTestId('next-button');
    expect(next).toBeEnabled();
    await user.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
    await user.click(screen.getByLabelText('Einschließen'));
    expect(screen.getByTestId('next-button')).toBeDisabled();
    await user.click(screen.getByLabelText('Einschließen'));
    expect(screen.getByTestId('next-button')).toBeEnabled();
    await user.click(screen.getByTestId('rep-delete-0'));
    expect(useWorkflow.getState().reps[0]!.removed).toBe(true);
  });

  it('Umbenennen über das Auswahlfeld stößt die Neuanalyse an', async () => {
    const user = userEvent.setup();
    setup({ cmj: 2 });
    await user.selectOptions(screen.getByTestId('relabel'), 'sj');
    await vi.waitFor(() => expect(useWorkflow.getState().reps[0]!.type).toBe('sj'));
    // nur der Block der gewählten Rep wird neu bewertet
    expect(useWorkflow.getState().reps[1]!.type).toBe('cmj');
  });

  it('„Neu aufnehmen“ ruft onAgain; Verwerfen fragt nach', async () => {
    const user = userEvent.setup();
    const { onAgain } = setup({ cmj: 1 });
    await user.click(screen.getByText(/Neu aufnehmen/));
    expect(onAgain).toHaveBeenCalledTimes(1);
    await user.click(screen.getByText('Aufnahme verwerfen'));
    expect(screen.getByText(/wirklich/i)).toBeInTheDocument();
  });
});

describe('repDetail (Phasen, Marker)', () => {
  it('CMJ: Phasen liegen geordnet und lückenlos von Onset bis Landung, Marker enthalten Onset/v=0/Takeoff/Landung', () => {
    const { recording, analysis } = makeRecording({ cmj: 1 });
    const rep = analysis.reps[0]!;
    const regions = repPhaseRegions(rep);
    expect(regions.map((r) => r.key)).toEqual(['unweighting', 'braking', 'concentric', 'flight', 'landing']);
    for (let i = 1; i < regions.length; i++) expect(regions[i]!.a).toBeGreaterThanOrEqual(regions[i - 1]!.a);
    const total = Float32Array.from(recording.trace.left, (v, i) => v + recording.trace.right[i]!);
    const marks = repAnnotations(rep, total, recording.trace.hz, 80, 0);
    const keys = marks.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['onset', 'vMax', 'zeroVel', 'takeoff', 'landing']));
    const vmax = marks.find((m) => m.key === 'vMax')!.idx;
    expect(vmax).toBeGreaterThan(rep.events['zeroVel']!);
    expect(vmax).toBeLessThan(rep.events['takeoff']!);
  });

  it('SJ: kein v=0-Marker (kein Gegenbewegen)', () => {
    const { recording, analysis } = makeRecording({ cmj: 0, sj: 1 });
    const rep = analysis.reps.find((r) => r.type === 'sj')!;
    const total = Float32Array.from(recording.trace.left, (v, i) => v + recording.trace.right[i]!);
    const keys = repAnnotations(rep, total, recording.trace.hz, 80, 0).map((m) => m.key);
    expect(keys).not.toContain('zeroVel');
  });
});
