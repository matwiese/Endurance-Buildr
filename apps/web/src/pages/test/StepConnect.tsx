import { useState } from 'react';
import { Banner, Button, Card, Field } from '../../components/ui.tsx';
import { useT } from '../../i18n/hooks.ts';
import { useLive } from '../../state/live.ts';
import { useSettings } from '../../state/settings.ts';
import { useWorkflow } from '../../state/workflow.ts';

type Source = 'simulator' | 'replay' | 'websocket' | 'serial' | 'bluetooth';

// Referenz-Aufnahmen (CSV) werden lazy mitgebündelt – für Demo und Wiedergabe-Tests
const DEMOS = import.meta.glob('../../../../../reference/*.csv', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;
const demoName = (path: string): string => path.split('/').pop()!.replace('.csv', '');

const SPEEDS = [1, 2, 5, 10];

export function StepConnect({ onConnected }: { onConnected: () => void }) {
  const { t } = useT();
  const settings = useSettings();
  const live = useLive();
  const wf = useWorkflow();
  const [source, setSource] = useState<Source>(live.adapterKind === 'replay' ? 'replay' : 'simulator');
  const [hz, setHz] = useState<number>(settings.defaultHz);
  const [speed, setSpeed] = useState(1);
  const [demo, setDemo] = useState(Object.keys(DEMOS)[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = live.connection === 'connected';

  const sources: Array<{ id: Source; title: string; desc?: string; stub?: boolean }> = [
    { id: 'simulator', title: t('connect.simulator'), desc: t('connect.simulator.desc') },
    { id: 'replay', title: t('connect.replay'), desc: t('connect.replay.desc') },
    { id: 'websocket', title: t('connect.websocket'), stub: true },
    { id: 'serial', title: t('connect.serial'), stub: true },
    { id: 'bluetooth', title: t('connect.bluetooth'), stub: true },
  ];

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      if (source === 'simulator')
        await live.connectSimulator({ hz, mode: wf.mode, load: wf.externalLoadKg, speed });
      else if (source === 'replay') {
        const loader = DEMOS[demo];
        if (!loader) throw new Error('no file');
        await live.connectReplay(await loader(), demoName(demo), { mode: wf.mode, speed });
      }
      wf.setDeviceSerial(useLive.getState().engine?.adapter.info.serial ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      await live.connectReplay(await f.text(), f.name, { mode: wf.mode, speed });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const sim = settings.simulator;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card title={t('connect.title')}>
        <p className="mb-3 text-muted">{t('connect.subtitle')}</p>
        <div className="grid gap-2" role="radiogroup" aria-label={t('connect.title')}>
          {sources.map((s) => (
            <label
              key={s.id}
              className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 ${source === s.id ? 'border-primary bg-surface2' : 'border-line'}`}
            >
              <input
                type="radio"
                name="source"
                className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
                checked={source === s.id}
                onChange={() => setSource(s.id)}
                data-testid={`source-${s.id}`}
              />
              <span>
                <span className="block font-semibold">{s.title}</span>
                {s.desc && <span className="block text-sm text-muted">{s.desc}</span>}
                {s.stub && <span className="block text-sm text-muted">{t('connect.driverRequired')}</span>}
              </span>
            </label>
          ))}
        </div>
      </Card>

      <Card title={source === 'simulator' ? t('connect.athlete') : t('connect.demoFile')}>
        {source === 'simulator' && (
          <>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label={t('connect.athlete.mass')} htmlFor="sim-mass">
                <input
                  id="sim-mass"
                  className="input"
                  type="number"
                  min={30}
                  max={200}
                  step={0.5}
                  value={sim.bodyMass}
                  onChange={(e) => settings.setSimulator({ bodyMass: Number(e.target.value) })}
                />
              </Field>
              <Field label={t('connect.athlete.jump')} htmlFor="sim-jump">
                <input
                  id="sim-jump"
                  className="input"
                  type="number"
                  min={10}
                  max={80}
                  step={1}
                  value={sim.jumpAbilityCm}
                  onChange={(e) => settings.setSimulator({ jumpAbilityCm: Number(e.target.value) })}
                />
              </Field>
              <Field label={t('connect.athlete.asym')} htmlFor="sim-asym">
                <input
                  id="sim-asym"
                  className="input"
                  type="number"
                  min={-30}
                  max={30}
                  step={1}
                  value={sim.asymmetryPct}
                  onChange={(e) => settings.setSimulator({ asymmetryPct: Number(e.target.value) })}
                />
              </Field>
              <Field label={t('connect.athlete.noise')} htmlFor="sim-noise">
                <input
                  id="sim-noise"
                  className="input"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={sim.noiseN}
                  onChange={(e) => settings.setSimulator({ noiseN: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label={t('connect.rate')} htmlFor="sim-hz">
                <select
                  id="sim-hz"
                  className="input"
                  value={hz}
                  onChange={(e) => setHz(Number(e.target.value))}
                >
                  {[200, 500, 1000].map((h) => (
                    <option key={h} value={h}>
                      {h} Hz
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tempo" htmlFor="sim-speed">
                <select
                  id="sim-speed"
                  className="input"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  data-testid="sim-speed"
                >
                  {SPEEDS.map((v) => (
                    <option key={v} value={v}>
                      {v}×
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}
        {source === 'replay' && (
          <>
            <Field label={t('connect.demoFile')} htmlFor="demo">
              <select id="demo" className="input" value={demo} onChange={(e) => setDemo(e.target.value)}>
                {Object.keys(DEMOS).map((p) => (
                  <option key={p} value={p}>
                    {demoName(p)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('connect.chooseFile')} htmlFor="csv">
              <input
                id="csv"
                className="input"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </Field>
          </>
        )}
        {(source === 'websocket' || source === 'serial' || source === 'bluetooth') && (
          <Banner tone="warn">{t('connect.driverRequired')}</Banner>
        )}

        {error && (
          <Banner tone="danger">
            {t('connect.failed')}: {error}
          </Banner>
        )}
        {connected && (
          <Banner tone="ok">
            {t('connect.ready')}: {live.adapterName} · {live.hz} Hz
          </Banner>
        )}
        <div className="mt-2 flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            disabled={busy || source === 'websocket' || source === 'serial' || source === 'bluetooth'}
            onClick={connect}
            data-testid="connect-button"
          >
            {t('connect.connect')}
          </Button>
          {connected && (
            <Button size="lg" onClick={() => void live.disconnect()} data-testid="disconnect-button">
              {t('connect.disconnect')}
            </Button>
          )}
          {connected && (
            <Button variant="primary" size="lg" onClick={onConnected} data-testid="next-button">
              {t('common.next')} →
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
