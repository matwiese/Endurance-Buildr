import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/ui.tsx';
import { useT } from '../i18n/hooks.ts';
import { Leaderboard } from './Leaderboard.tsx';
import { progress } from './queue.ts';
import { useSessionData } from './useSessionData.ts';

/** Beamer-/Vollbild-Rangliste: große Schrift, aktualisiert sich live (gleiches Gerät per BroadcastChannel, andere Rechner per Server). */
export function BeamerBoard() {
  const { id = '' } = useParams();
  const { t } = useT();
  const data = useSessionData(id, { remote: true });
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* Vollbild nicht verfügbar */
    }
  };
  const s = data.session;
  if (!data.loaded) return <div className="p-8 text-center text-muted">…</div>;
  if (!s) return <div className="p-8 text-center text-muted">{t('session.notFound')}</div>;
  const p = progress(s);
  return (
    <div className="min-h-screen bg-bg p-6" data-testid="beamer">
      <header className="mb-4 flex flex-wrap items-center gap-4">
        <h1 className="text-4xl font-extrabold">{s.name}</h1>
        <span className="text-xl text-muted">
          {t('session.summary.done', { done: p.done, total: p.total })}
        </span>
        <div className="ml-auto flex gap-2 opacity-70 hover:opacity-100">
          <Button size="sm" onClick={() => void toggle()} data-testid="beamer-fullscreen">
            {full ? '⤢' : '⛶'} {t('session.board.fullscreen')}
          </Button>
          <Link className="btn btn-sm" to={`/session/${id}`}>
            {t('session.back')}
          </Link>
        </div>
      </header>
      <Leaderboard
        session={s}
        profiles={data.profiles}
        tests={data.tests}
        big
        currentProfileId={s.queue.find((q) => q.status === 'testing')?.profileId}
      />
    </div>
  );
}
