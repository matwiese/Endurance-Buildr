import { TEST_TYPE_INFO } from '@buildr/core';
import { Banner, Button, Card } from '../../components/ui.tsx';
import { useT } from '../../i18n/hooks.ts';
import { useWorkflow } from '../../state/workflow.ts';

export function StepSave({
  onNextSameAthlete,
  onNewAthlete,
  labels,
}: {
  onNextSameAthlete: () => void;
  onNewAthlete: () => void;
  /** Beschriftung der beiden Folgeaktionen (Gruppentest: „Erneut testen“ / „Nächster Athlet“) */
  labels?: { same: string; other: string };
}) {
  const { t, lang } = useT();
  const wf = useWorkflow();
  const included = wf.reps.filter((r) => !r.removed && r.included && !r.leadIn);
  const types = new Set(included.map((r) => r.type));
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Card title={t('save.title')}>
        {wf.saved.length === 0 ? (
          <>
            <p className="mb-4 text-lg">{t('save.summary', { n: types.size, reps: included.length })}</p>
            <ul className="mb-4 list-disc pl-6 text-muted">
              {[...types].map((ty) => (
                <li key={ty}>
                  {ty === 'unclear' ? '?' : TEST_TYPE_INFO[ty].label[lang]}:{' '}
                  {included.filter((r) => r.type === ty).length}
                </li>
              ))}
            </ul>
            {wf.saveError === 'nothing' && <Banner tone="warn">{t('save.nothing')}</Banner>}
            {wf.saveError === 'unclear' && <Banner tone="warn">{t('record.unclear')}</Banner>}
            {wf.saveError && wf.saveError !== 'nothing' && wf.saveError !== 'unclear' && (
              <Banner tone="danger">
                {t('save.failed')}: {wf.saveError}
              </Banner>
            )}
            <Button
              variant="primary"
              size="lg"
              disabled={wf.busy || included.length === 0}
              onClick={() => void wf.save()}
              data-testid="save-button"
            >
              {wf.busy ? t('save.saving') : t('save.button')}
            </Button>
          </>
        ) : (
          <div data-testid="saved">
            <Banner tone="ok">
              <b>{t('save.saved')}</b> · {t('save.queued')}
            </Banner>
            <ul className="mb-4 list-disc pl-6">
              {wf.saved.map((tst) => (
                <li key={tst.id}>
                  {TEST_TYPE_INFO[tst.testType].label[lang]} · {tst.reps.filter((r) => r.included).length}×
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" onClick={onNextSameAthlete} data-testid="next-same">
                {labels?.same ?? t('save.next')}
              </Button>
              <Button size="lg" onClick={onNewAthlete} data-testid="next-other">
                {labels?.other ?? t('save.newAthlete')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
