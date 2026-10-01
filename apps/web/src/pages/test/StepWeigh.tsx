import { useState } from 'react';
import { G } from '@buildr/core';
import { Banner, Button, Card, Field } from '../../components/ui.tsx';
import { useT } from '../../i18n/hooks.ts';
import { LivePlot } from '../../plot/LivePlot.tsx';
import { SimulatorPanel } from '../../components/SimulatorPanel.tsx';
import { useLive } from '../../state/live.ts';
import { useSettings } from '../../state/settings.ts';
import { useWorkflow } from '../../state/workflow.ts';
import { TEST_TYPE_INFO } from '@buildr/core';

/** Schritt „Wiegen“: Stabilitätsampel (≥ 1 s stabil ⇒ grün), Körpermasse = mittlere Gesamtkraft / g; Überspringen je nach Testtyp. */
export function StepWeigh({ onNext }: { onNext: () => void }) {
  const { t } = useT();
  const live = useLive();
  const wf = useWorkflow();
  const windowS = useSettings((s) => s.plotWindowS);
  const [manual, setManual] = useState('');
  const w = live.weigh;
  const isAuto = wf.mode === 'auto';
  const isIso = wf.mode !== 'auto' && TEST_TYPE_INFO[wf.mode].family === 'isometric';
  const status = !w || !w.loaded ? 'empty' : w.stable ? 'stable' : 'settling';
  const tone = status === 'stable' ? 'bg-ok' : status === 'settling' ? 'bg-warn' : 'bg-danger';
  const known = wf.profile?.weightKg ?? null;

  const accept = async () => {
    const kg = await live.lockWeight();
    if (kg) onNext();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card title={t('weigh.title')}>
        <p className="mb-3 text-lg font-semibold">
          {isIso ? t('weigh.instruction.iso') : t('weigh.instruction')}
        </p>
        <div
          className="mb-4 flex items-center gap-4 rounded-2xl border border-line p-4"
          data-testid="weigh-light"
          data-status={status}
        >
          <span
            className={`h-14 w-14 shrink-0 rounded-full ${tone} ${status === 'stable' ? 'shadow-[0_0_24px_var(--ok)]' : ''}`}
            aria-hidden
          />
          <div>
            <div className="text-4xl font-extrabold tabular-nums" data-testid="weigh-mass">
              {w && w.loaded ? w.massKg.toFixed(1) : '–'}{' '}
              <span className="text-xl font-semibold text-muted">kg</span>
            </div>
            <div className="text-sm font-medium" role="status">
              {status === 'stable'
                ? t('weigh.stable')
                : status === 'settling'
                  ? t('weigh.settling')
                  : t('weigh.empty')}
            </div>
            {w && w.loaded && (
              <div className="text-xs text-muted tabular-nums">
                {w.meanN.toFixed(0)} N · SD {w.sdN.toFixed(1)} N
              </div>
            )}
          </div>
        </div>
        {isAuto && <Banner tone="warn">{t('weigh.required')}</Banner>}
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            disabled={status !== 'stable'}
            onClick={() => void accept()}
            data-testid="weigh-accept"
          >
            {t('weigh.accept')}
          </Button>
          {known && (
            <Button
              onClick={() => {
                live.setMass(known);
                onNext();
              }}
              data-testid="weigh-known"
            >
              {t('weigh.keep', { kg: known })}
            </Button>
          )}
          <Field label={t('weigh.manual')} htmlFor="manual-kg">
            <div className="flex gap-2">
              <input
                id="manual-kg"
                className="input"
                type="number"
                min={20}
                max={250}
                step={0.1}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <Button
                disabled={!(Number(manual) > 20)}
                onClick={() => {
                  live.setMass(Number(manual));
                  onNext();
                }}
              >
                OK
              </Button>
            </div>
          </Field>
          {!isAuto && (
            <div>
              <Button
                onClick={() => {
                  live.cancelWeigh();
                  live.setMass(null);
                  onNext();
                }}
                data-testid="weigh-skip"
              >
                {t('weigh.skip')}
              </Button>
              <p className="mt-1 text-xs text-muted">{t('weigh.skip.hint')}</p>
            </div>
          )}
        </div>
        {live.massKg && (
          <p className="mt-3 text-sm text-muted">
            {t('weigh.mass')}: <b>{live.massKg.toFixed(1)} kg</b> ({(live.massKg * G).toFixed(0)} N)
          </p>
        )}
      </Card>
      <div className="h-[46vh] min-h-72 lg:h-auto">
        <LivePlot
          engine={live.engine}
          windowS={windowS}
          bwN={w && w.loaded ? w.meanN : null}
          yMaxN={w && w.loaded ? Math.max(1200, w.meanN * 1.4) : 1200}
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
