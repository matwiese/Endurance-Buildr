import { useEffect, useState } from 'react';
import { useT } from '../i18n/hooks.ts';
import { localRepo } from '../offline/repo.ts';
import { useLive } from '../state/live.ts';
import { Dot } from './ui.tsx';

/** Statusanzeigen: Verbindung, Akku, Abtastrate, Paketverlust, Zero-Status, Latenz, Online/Offline, Upload-Warteschlange. */
export function StatusBar() {
  const { t } = useT();
  const s = useLive();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [queue, setQueue] = useState(0);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    let alive = true;
    const poll = () =>
      localRepo.outbox
        .count()
        .then((n) => alive && setQueue(n))
        .catch(() => undefined);
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const conn = s.connection;
  const tone =
    conn === 'connected' ? 'ok' : conn === 'connecting' ? 'warn' : conn === 'error' ? 'danger' : 'off';
  const connText = t(`status.${conn}` as 'status.connected');
  const zeroTone = s.zero.ok ? 'ok' : s.zero.running ? 'warn' : 'off';
  return (
    <div
      role="status"
      aria-label="Status"
      data-testid="status-bar"
      className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-line bg-surface px-4 py-2 text-sm"
    >
      <span className="flex items-center gap-2" data-testid="status-connection">
        <Dot tone={tone} />
        <span className="font-medium">{s.adapterName ?? t('status.connection')}</span>
        <span className="text-muted">{connText}</span>
      </span>
      <span title={t('status.battery')}>
        🔋 {s.batteryPct === null ? '–' : `${Math.round(s.batteryPct)} %`}
      </span>
      <span title={t('status.rate')}>{s.hz} Hz</span>
      <span title={t('status.loss')} className={s.lossPct > 1 ? 'text-warn' : ''}>
        {t('status.loss')} {s.lossPct.toFixed(1)} %
      </span>
      <span className="flex items-center gap-2" data-testid="status-zero">
        <Dot tone={zeroTone} />
        {s.zero.ok ? t('status.zeroOk') : t('status.zeroNone')}
      </span>
      <span data-testid="status-latency" title={t('status.latency')}>
        {t('status.latency')} {s.latencyMs ? `${Math.round(s.latencyMs)} ms` : '–'}
      </span>
      <span className="ml-auto flex items-center gap-4">
        <span className={online ? 'text-muted' : 'font-semibold text-warn'}>
          {online ? t('status.online') : t('status.offline')}
        </span>
        <span title={t('status.queue')}>⇪ {queue}</span>
      </span>
    </div>
  );
}
