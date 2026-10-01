import { TEST_TYPES, TEST_TYPE_INFO, type TestType } from '@buildr/core';
import type { SimTrialType } from '@buildr/device';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/hooks.ts';
import { useLive } from '../state/live.ts';
import { useWorkflow } from '../state/workflow.ts';
import { Button, Toggle } from './ui.tsx';

const AUTO_PLAN: SimTrialType[] = ['cmj', 'sj', 'cmrj', 'dj', 'hop'];
const SIM_TYPES: SimTrialType[] = [...TEST_TYPES, 'failed_attempt'];

/** Steuerung des simulierten Athleten (nur beim Simulator): Auftreten/Abtreten, Versuche abspielen, Autopilot. */
export function SimulatorPanel({ speed = 1 }: { speed?: number }) {
  const { t, lang } = useT();
  const live = useLive();
  const wf = useWorkflow();
  const sim = live.simulator;
  const [type, setType] = useState<SimTrialType>('cmj');
  const [autopilot, setAutopilot] = useState(false);
  const [load, setLoad] = useState(0);
  const [, force] = useState(0);
  const planIdx = useRef(0);
  const cool = useRef(0);

  // Anzeige aktualisieren (Presence/Warteschlange)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // Autopilot: nächsten Versuch passend zum gewählten Test starten, sobald der Athlet ruht
  useEffect(() => {
    if (!autopilot || !sim) return;
    const id = setInterval(() => {
      const st = useLive.getState();
      if (st.phase !== 'recording') return;
      if (sim.queueLength > 0) {
        cool.current = Date.now() + 600 / speed;
        return;
      }
      if (Date.now() < cool.current) return;
      const mode = useWorkflow.getState().mode;
      const next: SimTrialType = mode === 'auto' ? AUTO_PLAN[planIdx.current % AUTO_PLAN.length]! : mode;
      planIdx.current++;
      try {
        sim.perform(next, {
          loadKg: TEST_TYPE_INFO[next as TestType]?.loaded ? Math.max(wf.externalLoadKg, 20) : undefined,
        });
      } catch {
        /* nicht verbunden */
      }
    }, 250);
    return () => clearInterval(id);
  }, [autopilot, sim, speed, wf.externalLoadKg]);

  if (!sim) return null;
  const presence = sim.presence;
  return (
    <details className="card" open data-testid="sim-panel">
      <summary className="cursor-pointer text-lg font-semibold">{t('record.simulator')}</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Button onClick={() => sim.stepOn()} data-testid="sim-stepon">
          {t('record.simulator.stepOn')}
        </Button>
        <Button onClick={() => sim.stepOff()} data-testid="sim-stepoff">
          {t('record.simulator.stepOff')}
        </Button>
        <span className="chip" data-testid="sim-presence">
          {presence === 'standing' ? '🧍' : presence === 'moving' ? '🏃' : '⬜'} {presence}
          {sim.currentLabel ? ` · ${sim.currentLabel}` : ''}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="sim-type">
            {t('step.testType')}
          </label>
          <select
            id="sim-type"
            className="input min-w-64"
            value={type}
            onChange={(e) => setType(e.target.value as SimTrialType)}
            data-testid="sim-type"
          >
            {SIM_TYPES.map((x) => (
              <option key={x} value={x}>
                {x === 'failed_attempt' ? '✗ Fehlversuch' : TEST_TYPE_INFO[x].label[lang]}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            try {
              sim.perform(type, {
                loadKg: TEST_TYPE_INFO[type as TestType]?.loaded
                  ? Math.max(wf.externalLoadKg, 20)
                  : undefined,
              });
            } catch {
              /* ignore */
            }
          }}
          data-testid="sim-perform"
        >
          {t('record.simulator.perform')}
        </Button>
        <div>
          <label className="label" htmlFor="sim-load">
            {t('record.simulator.load')}
          </label>
          <div className="flex gap-2">
            <input
              id="sim-load"
              className="input w-24"
              type="number"
              min={0}
              value={load}
              onChange={(e) => setLoad(Number(e.target.value))}
            />
            <Button onClick={() => sim.setLoad(load)}>OK</Button>
          </div>
        </div>
      </div>
      <div className="mt-2">
        <Toggle label={t('record.simulator.autopilot')} checked={autopilot} onChange={setAutopilot} />
        <p className="text-xs text-muted">{t('record.simulator.autopilot.desc')}</p>
      </div>
    </details>
  );
}
