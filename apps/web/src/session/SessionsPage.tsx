import { TEST_TYPES, TEST_TYPE_INFO, type TestType } from '@buildr/core';
import type { SessionDTO } from '@buildr/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/NameDialog.tsx';
import { Banner, Button, Card, Chip, Field } from '../components/ui.tsx';
import { useRefData } from '../hub/hooks.ts';
import { saveProfiles } from '../hub/services.ts';
import { useT } from '../i18n/hooks.ts';
import type { MessageKey } from '../i18n/index.ts';
import { uid } from '../lib/uid.ts';
import { useRepoVersion } from '../offline/events.ts';
import { localRepo } from '../offline/repo.ts';
import { demoProfiles } from './demo.ts';
import { newSession, progress } from './queue.ts';
import { deleteSession, saveSession } from './service.ts';

/** Übersicht der Gruppentests und Assistent „Neue Session“ (Athleten wählen, Testtyp, Last). */
export function SessionsPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const data = useRefData();
  const version = useRepoVersion();
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'auto' | TestType>('cmj');
  const [load, setLoad] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [groupId, setGroupId] = useState('');
  const [q, setQ] = useState('');
  const [toDelete, setToDelete] = useState<SessionDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void localRepo.sessions.list().then(setSessions);
  }, [version]);

  const byId = useMemo(() => new Map(data.profiles.map((p) => [p.id, p])), [data.profiles]);
  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.profiles
      .filter((p) => !picked.includes(p.id) && (!needle || p.name.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.profiles, picked, q]);
  const loaded = mode !== 'auto' && TEST_TYPE_INFO[mode].loaded;

  const create = async (profileIds: string[], opts: { name?: string; mode?: 'auto' | TestType } = {}) => {
    setBusy(true);
    try {
      const s = newSession({
        id: uid(),
        name:
          opts.name ??
          (name ||
            t('session.name.default', {
              date: new Date().toLocaleDateString(lang === 'de' ? 'de-AT' : 'en-GB'),
            })),
        mode: opts.mode ?? mode,
        externalLoadKg: loaded ? Math.max(load, 1) : 0,
        groupId: groupId || null,
        profileIds,
      });
      await saveSession(s);
      navigate(`/session/${s.id}`);
    } finally {
      setBusy(false);
    }
  };

  const createDemo = async () => {
    const group = data.groups.find((g) => g.id === groupId) ?? data.groups[0];
    if (!group) return;
    setBusy(true);
    try {
      const people = demoProfiles(group);
      await saveProfiles(people);
      await create(
        people.map((p) => p.id),
        { name: `Demo ${new Date().toLocaleTimeString(lang === 'de' ? 'de-AT' : 'en-GB')}`, mode: 'cmj' },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_1fr]" data-testid="sessions-page">
      <Card title={t('session.new')}>
        <Field label={t('session.name')} htmlFor="s-name">
          <input
            id="s-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="session-name-input"
          />
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label={t('session.mode')} htmlFor="s-mode">
            <select
              id="s-mode"
              className="input"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'auto' | TestType)}
              data-testid="session-mode"
            >
              <option value="auto">{t('test.auto')}</option>
              {TEST_TYPES.map((x) => (
                <option key={x} value={x}>
                  {TEST_TYPE_INFO[x].label[lang]}
                </option>
              ))}
            </select>
          </Field>
          {loaded && (
            <Field label={t('session.load')} htmlFor="s-load">
              <input
                id="s-load"
                className="input"
                type="number"
                min={1}
                value={load}
                onChange={(e) => setLoad(Number(e.target.value))}
              />
            </Field>
          )}
        </div>

        <h3 className="mb-2 mt-2 font-semibold">{t('session.athletes')}</h3>
        <div className="mb-2 flex flex-wrap gap-2">
          <select
            className="input min-h-10 w-56"
            aria-label={t('profile.group')}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            data-testid="session-group"
          >
            <option value="">{t('profiles.filter.all')}</option>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!groupId}
            onClick={() =>
              setPicked((cur) => [
                ...new Set([
                  ...cur,
                  ...data.profiles.filter((p) => p.groupIds.includes(groupId)).map((p) => p.id),
                ]),
              ])
            }
            data-testid="session-add-group"
          >
            + {t('session.athletes.group')}
          </Button>
        </div>
        <input
          className="input mb-2"
          placeholder={t('session.athletes.search')}
          aria-label={t('session.athletes.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="session-search"
        />
        {q.trim() && (
          <ul className="mb-2 max-h-40 overflow-auto rounded-xl border border-line">
            {candidates.slice(0, 20).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-surface2"
                  onClick={() => setPicked((cur) => [...cur, p.id])}
                  data-testid={`session-pick-${p.name}`}
                >
                  + {p.name}
                </button>
              </li>
            ))}
            {candidates.length === 0 && <li className="px-3 py-2 text-muted">{t('profiles.noMatch')}</li>}
          </ul>
        )}
        {picked.length === 0 ? (
          <p className="mb-3 text-sm text-muted">{t('session.athletes.none')}</p>
        ) : (
          <>
            <p className="mb-1 text-sm font-semibold" data-testid="session-picked-count">
              {t('session.athletes.count', { n: picked.length })}
            </p>
            <ul className="mb-3 flex flex-wrap gap-1">
              {picked.map((id) => (
                <li key={id}>
                  <Chip>
                    {byId.get(id)?.name ?? '?'}
                    <button
                      type="button"
                      className="ml-1 text-muted hover:text-danger"
                      aria-label={`${t('queue.remove')}: ${byId.get(id)?.name ?? ''}`}
                      onClick={() => setPicked((cur) => cur.filter((x) => x !== id))}
                    >
                      ✕
                    </button>
                  </Chip>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            disabled={busy || picked.length === 0}
            onClick={() => void create(picked)}
            data-testid="session-create"
          >
            {t('session.create')}
          </Button>
          <Button
            size="lg"
            disabled={busy || data.groups.length === 0}
            onClick={() => void createDemo()}
            data-testid="session-demo"
          >
            {t('session.demo')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">{t('session.demo.hint')}</p>
      </Card>

      <Card title={t('session.list.title')}>
        {sessions.length === 0 && <p className="text-muted">{t('session.list.empty')}</p>}
        <ul className="grid gap-2" data-testid="session-list">
          {sessions.map((s) => {
            const p = progress(s);
            return (
              <li
                key={s.id}
                className="rounded-xl border border-line p-3"
                data-testid={`session-item-${s.name}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto font-semibold">{s.name}</span>
                  <Chip tone={s.status === 'active' ? 'ok' : s.status === 'paused' ? 'warn' : 'default'}>
                    {t(`session.status.${s.status}` as MessageKey)}
                  </Chip>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{t('session.summary.done', { done: p.done, total: p.total })}</span>
                  <span>
                    ·{' '}
                    {new Date(s.createdAt).toLocaleString(lang === 'de' ? 'de-AT' : 'en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                  <span className="ml-auto flex gap-2">
                    <Link
                      to={`/session/${s.id}`}
                      className="btn btn-sm btn-primary"
                      data-testid={`session-open-${s.name}`}
                    >
                      {s.status === 'finished' ? t('session.open') : t('session.resume')}
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => setToDelete(s)}>
                      {t('session.delete')}
                    </Button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {data.loaded && data.profiles.length === 0 && <Banner tone="warn">{t('profiles.empty')}</Banner>}
      </Card>
      {toDelete && (
        <ConfirmDialog
          title={t('session.delete')}
          text={t('session.delete.confirm', { name: toDelete.name })}
          confirmLabel={t('session.delete')}
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteSession(toDelete.id);
            setToDelete(null);
          }}
        />
      )}
    </div>
  );
}
