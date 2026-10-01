import { useMemo } from 'react';
import { StatusBar } from '../../components/StatusBar.tsx';
import { StepBar } from '../../components/StepBar.tsx';
import { useT } from '../../i18n/hooks.ts';
import { useLive } from '../../state/live.ts';
import { STEPS, useWorkflow, type StepId } from '../../state/workflow.ts';
import { StepConnect } from './StepConnect.tsx';
import { StepProfile } from './StepProfile.tsx';
import { StepRecord } from './StepRecord.tsx';
import { StepReview } from './StepReview.tsx';
import { StepSave } from './StepSave.tsx';
import { StepTestType } from './StepTestType.tsx';
import { StepWeigh } from './StepWeigh.tsx';
import { StepZero } from './StepZero.tsx';
import { useWorkflowEffects } from './useWorkflowEffects.ts';

/** Linearer Test-Workflow mit sichtbarer Schrittleiste: Gerät → Test → Athlet → Nullen → Wiegen → Aufnahme → Ergebnis → Speichern. */
export function TestWorkflow({ simSpeed = 1 }: { simSpeed?: number }) {
  const { t } = useT();
  const wf = useWorkflow();
  const live = useLive();
  const idx = STEPS.indexOf(wf.step);
  const done = useMemo(() => new Set<StepId>(STEPS.slice(0, idx)), [idx]);

  const go = (s: StepId) => wf.setStep(s);
  const next = () => go(STEPS[Math.min(STEPS.length - 1, idx + 1)]!);

  useWorkflowEffects({ onConnectionLost: () => wf.setStep('connect') });

  return (
    <div
      className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 p-3 sm:p-4"
      data-testid="test-workflow"
      data-step={wf.step}
    >
      <StepBar steps={STEPS} current={wf.step} done={done} onSelect={go} />
      <StatusBar />
      <section aria-label={t(`step.${wf.step}` as 'step.connect')}>
        {wf.step === 'connect' && <StepConnect onConnected={next} />}
        {wf.step === 'testType' && <StepTestType onNext={next} />}
        {wf.step === 'profile' && <StepProfile onNext={next} />}
        {wf.step === 'zero' && <StepZero onNext={next} />}
        {wf.step === 'weigh' && <StepWeigh onNext={next} />}
        {wf.step === 'record' && <StepRecord simSpeed={simSpeed} />}
        {wf.step === 'review' && <StepReview onNext={next} onAgain={() => go('record')} />}
        {wf.step === 'save' && (
          <StepSave
            onNextSameAthlete={() => {
              live.resetRecordingState();
              wf.resetForNextTest();
            }}
            onNewAthlete={() => {
              live.resetRecordingState();
              wf.resetForNextTest();
              wf.setProfile(null);
              wf.setStep('profile');
            }}
          />
        )}
      </section>
    </div>
  );
}
