import { useEffect, useState } from 'react';
import { Banner, Button, Card } from '../../components/ui.tsx';
import { RepResults, typeLabel } from '../../components/RepResults.tsx';
import { SimulatorPanel } from '../../components/SimulatorPanel.tsx';
import { useMetricFormat, useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { LivePlot } from '../../plot/LivePlot.tsx';
import { useLive } from '../../state/live.ts';
import { tilesFor, useSettings } from '../../state/settings.ts';
import { useWorkflow } from '../../state/workflow.ts';

const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Schritt „Aufnahme“: Start/Pause/Fortsetzen/Stopp, Live-Kurve, Sofortergebnisse, Re-Zero, Simulator-Steuerung. */
export function StepRecord({ simSpeed }: { simSpeed: number }) {
  const { t, lang } = useT();
  const live = useLive();
  const wf = useWorkflow();
  const settings = useSettings();
  const { format, label } = useMetricFormat();
  const [paused, setPaused] = useState(false);
  const [stopping, setStopping] = useState(false);
  const recording = live.phase === 'recording' || live.phase === 'paused';
  const bw = live.massKg ? (live.massKg + wf.externalLoadKg) * 9.80665 : null;

  useEffect(() => {
    if (live.phase === 'idle') setPaused(false);
  }, [live.phase]);

  const start = async () => {
    live.configure(wf.mode, wf.externalLoadKg);
    await live.startRecording();
  };
  const stop = async () => {
    setStopping(true);
    try {
      const res = await live.engine?.stop();
      if (res) wf.finishRecording(res.recording, res.analysis);
    } finally {
      setStopping(false);
    }
  };

  const last = live.liveReps[live.liveReps.length - 1];
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card title={t('record.title')}>
          <Banner>{t('record.hint')}</Banner>
          {live.errorCode && <Banner tone="danger">{t(`err.${live.errorCode}` as MessageKey)}</Banner>}
          <div className="mb-3 flex items-center gap-3 text-lg" data-testid="record-state">
            <span
              className={`h-3 w-3 rounded-full ${live.phase === 'recording' ? 'animate-pulse bg-danger' : live.phase === 'paused' ? 'bg-warn' : 'bg-muted'}`}
              aria-hidden
            />
            <b>
              {live.phase === 'recording'
                ? t('record.recording')
                : live.phase === 'paused'
                  ? t('record.paused')
                  : t('record.ready')}
            </b>
            <span className="tabular-nums text-muted" data-testid="record-elapsed">
              {fmtTime(live.progressS)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!recording && (
              <Button
                variant="primary"
                size="lg"
                className="col-span-2"
                onClick={() => void start()}
                data-testid="record-start"
              >
                ● {t('record.start')}
              </Button>
            )}
            {recording && !paused && (
              <Button
                size="lg"
                onClick={() => {
                  live.engine?.pause();
                  setPaused(true);
                }}
                data-testid="record-pause"
              >
                ⏸ {t('record.pause')}
              </Button>
            )}
            {recording && paused && (
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  live.engine?.resume();
                  setPaused(false);
                }}
                data-testid="record-resume"
              >
                ▶ {t('record.resume')}
              </Button>
            )}
            {recording && (
              <Button
                variant="danger"
                size="lg"
                disabled={stopping}
                onClick={() => void stop()}
                data-testid="record-stop"
              >
                ■ {t('record.stop')}
              </Button>
            )}
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              disabled={live.zero.running}
              onClick={() => live.rezero()}
              data-testid="record-rezero"
              title={t('record.rezero.hint')}
            >
              ⟲ {t('record.rezero')}
            </Button>
            {live.zero.running && <span className="ml-3 text-sm text-warn">{t('zero.running')}</span>}
            {live.zero.reason && !live.zero.running && (
              <p className="mt-2 text-sm text-danger">{t(`zero.failed.${live.zero.reason}` as MessageKey)}</p>
            )}
          </div>
          {live.massKg && (
            <p className="mt-3 text-sm text-muted">
              {t('weigh.mass')}: <b>{live.massKg.toFixed(1)} kg</b>
              {live.massSource === 'estimated' && ' ≈'}
            </p>
          )}
        </Card>
        <div className="h-[44vh] min-h-72 lg:h-[52vh]">
          <LivePlot
            engine={live.engine}
            windowS={settings.plotWindowS}
            bwN={bw}
            markers={live.markers}
            ariaLabel={t('record.leftRight')}
            labels={{ left: 'L', right: 'R', total: t('results.total'), bw: 'BW' }}
          />
        </div>
      </div>

      <Card title={t('record.liveResults')}>
        {!last ? (
          <p className="text-muted" data-testid="live-empty">
            {t('record.noResultsYet')}
          </p>
        ) : (
          <div data-testid="live-results">
            <RepResults rep={last} title={t('results.rep', { n: live.liveReps.length })} />
            {live.liveReps.length > 1 && (
              <ul
                className="mt-3 divide-y divide-line rounded-xl border border-line text-sm"
                data-testid="live-rep-list"
              >
                {live.liveReps.slice(0, -1).map((r, i) => {
                  const k = r.type === 'unclear' ? null : tilesFor(settings, r.type)[0];
                  return (
                    <li key={i} className="flex items-center justify-between px-3 py-2">
                      <span>
                        {t('results.rep', { n: i + 1 })} · {typeLabel(r.type, lang, t('record.unclear'))}
                      </span>
                      {k && (
                        <span className="tabular-nums text-muted">
                          {label(k)}: <b className="text-text">{format(k, r.metrics[k])}</b>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Card>
      <SimulatorPanel speed={simSpeed} />
    </div>
  );
}
