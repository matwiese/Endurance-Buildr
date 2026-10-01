import type { ProfileDTO, QueueStatus, SessionDTO, TestRecord } from '@buildr/shared';
import { useMemo, useState } from 'react';
import { Button, Card, Chip } from '../components/ui.tsx';
import { useT } from '../i18n/hooks.ts';
import type { MessageKey } from '../i18n/index.ts';

const TONE: Record<QueueStatus, 'default' | 'ok' | 'warn' | 'primary'> = {
  waiting: 'default',
  testing: 'primary',
  done: 'ok',
  skipped: 'warn',
};

export interface QueueActions {
  start: (profileId: string) => void;
  move: (profileId: string, dir: -1 | 1) => void;
  remove: (profileId: string) => void;
  skip: (profileId: string) => void;
  requeue: (profileId: string) => void;
  add: (profileId: string) => void;
}

/** Warteschlange: Status je Athlet, Umsortieren, Hinzufügen/Entfernen, Überspringen, Erneut testen. */
export function QueuePanel({
  session,
  profiles,
  allProfiles,
  tests,
  busy,
  actions,
}: {
  session: SessionDTO;
  profiles: Map<string, ProfileDTO>;
  allProfiles: ProfileDTO[];
  tests: TestRecord[];
  /** Aufnahme läuft → Athletenwechsel gesperrt */
  busy: boolean;
  actions: QueueActions;
}) {
  const { t } = useT();
  const [adding, setAdding] = useState('');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of tests) if (x.profileId) m.set(x.profileId, (m.get(x.profileId) ?? 0) + 1);
    return m;
  }, [tests]);
  const inQueue = new Set(session.queue.map((q) => q.profileId));
  const candidates = allProfiles
    .filter((p) => !inQueue.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const active = session.status === 'active';

  return (
    <Card title={t('session.queue')} className="max-h-[75vh] overflow-y-auto">
      <ol className="grid gap-2" data-testid="queue">
        {session.queue.map((q, i) => {
          const p = profiles.get(q.profileId);
          const n = counts.get(q.profileId) ?? 0;
          const name = p?.name ?? '?';
          return (
            <li
              key={q.profileId}
              data-testid={`queue-${name}`}
              data-status={q.status}
              className={`rounded-xl border p-2 ${q.status === 'testing' ? 'border-primary bg-surface2' : 'border-line'} ${q.status === 'skipped' ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="w-6 text-right text-sm tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
                <Chip tone={TONE[q.status]}>{t(`queue.status.${q.status}` as MessageKey)}</Chip>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1 pl-8">
                <span className="mr-auto text-xs text-muted">{t('queue.tests', { n })}</span>
                {active && q.status !== 'testing' && q.status !== 'skipped' && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => actions.start(q.profileId)}
                    data-testid={`queue-start-${name}`}
                  >
                    {q.status === 'done' ? t('queue.retest') : t('queue.start')}
                  </Button>
                )}
                {q.status === 'skipped' && (
                  <Button size="sm" className="btn-xs" onClick={() => actions.requeue(q.profileId)}>
                    {t('queue.requeue')}
                  </Button>
                )}
                {q.status === 'waiting' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.skip(q.profileId)}
                    data-testid={`queue-skip-${name}`}
                  >
                    {t('queue.skip')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${t('queue.up')}: ${name}`}
                  disabled={i === 0}
                  onClick={() => actions.move(q.profileId, -1)}
                  data-testid={`queue-up-${name}`}
                >
                  ▲
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${t('queue.down')}: ${name}`}
                  disabled={i === session.queue.length - 1}
                  onClick={() => actions.move(q.profileId, 1)}
                  data-testid={`queue-down-${name}`}
                >
                  ▼
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`${t('queue.remove')}: ${name}`}
                  disabled={q.status === 'testing'}
                  onClick={() => actions.remove(q.profileId)}
                  data-testid={`queue-remove-${name}`}
                >
                  ✕
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      {candidates.length > 0 && (
        <div className="mt-3 flex gap-2">
          <select
            className="input min-h-10 flex-1"
            aria-label={t('queue.add')}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            data-testid="queue-add-select"
          >
            <option value="">{t('queue.add')} …</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!adding}
            onClick={() => {
              actions.add(adding);
              setAdding('');
            }}
            data-testid="queue-add"
          >
            +
          </Button>
        </div>
      )}
    </Card>
  );
}
