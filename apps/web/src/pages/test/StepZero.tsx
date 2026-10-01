import { Banner, Button, Card, Spinner } from '../../components/ui.tsx';
import { useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { LivePlot } from '../../plot/LivePlot.tsx';
import { SimulatorPanel } from '../../components/SimulatorPanel.tsx';
import { useLive } from '../../state/live.ts';
import { useSettings } from '../../state/settings.ts';

/** Schritt „Nullen“: Overlay-Hinweis „Nichts auf die Platten stellen“, Start-Button, Ergebnis/Fehler. */
export function StepZero({ onNext, sessionMode }: { onNext: () => void; sessionMode?: boolean }) {
  const { t } = useT();
  const live = useLive();
  const windowS = useSettings((s) => s.plotWindowS);
  const z = live.zero;
  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card title={t('zero.title')}>
        <div
          role="alert"
          className="mb-4 rounded-2xl border-2 border-warn bg-warn/10 p-5 text-center"
          data-testid="zero-instruction"
        >
          <div className="text-2xl font-extrabold">🚫 {t('zero.instruction')}</div>
          <div className="mt-1 text-sm text-muted">{t('zero.instruction.sub')}</div>
        </div>
        {z.running && (
          <div className="mb-3">
            <Spinner label={t('zero.running')} />
          </div>
        )}
        {z.ok && !z.running && (
          <Banner tone="ok">
            <b>{t('zero.ok')}</b> ·{' '}
            {t('zero.offsets', { left: z.left.toFixed(1), right: z.right.toFixed(1) })}
          </Banner>
        )}
        {z.reason && !z.running && (
          <Banner tone="danger">{t(`zero.failed.${z.reason}` as MessageKey)}</Banner>
        )}
        {sessionMode && <p className="mb-2 text-xs text-muted">{t('zero.onceHint')}</p>}
        <div className="flex flex-wrap gap-3">
          <Button
            variant={z.ok ? 'default' : 'primary'}
            size="lg"
            disabled={z.running || live.connection !== 'connected'}
            onClick={() => live.startZero()}
            data-testid="zero-start"
          >
            {z.ok ? t('zero.again') : t('zero.start')}
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!z.ok || z.running}
            onClick={onNext}
            data-testid="next-button"
          >
            {t('common.next')} →
          </Button>
        </div>
      </Card>
      <div className="h-[46vh] min-h-72 lg:h-auto">
        <LivePlot
          engine={live.engine}
          windowS={windowS}
          yMaxN={200}
          ariaLabel={t('record.leftRight')}
          labels={{ left: 'L', right: 'R', total: t('results.total'), bw: 'BW' }}
        />
      </div>
      <div className="lg:col-span-2">
        <SimulatorPanel />
      </div>
    </div>
  );
}
