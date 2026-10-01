import { TEST_TYPE_INFO } from '@buildr/core';
import type { GroupDTO, ProfileDTO, TestRecord } from '@buildr/shared';
import { useEffect, useMemo, useState } from 'react';
import { ProfileForm, emptyProfile } from '../../components/ProfileForm.tsx';
import { Banner, Button, Card, Modal } from '../../components/ui.tsx';
import { useMetricFormat, useT } from '../../i18n/hooks.ts';
import { ageYears, formatDateTime } from '../../lib/format.ts';
import { summarize } from '../../lib/summary.ts';
import { ensureDefaultGroup } from '../../model/seed.ts';
import { localRepo } from '../../offline/repo.ts';
import { useAuth } from '../../state/auth.ts';
import { useSyncState } from '../../sync/index.ts';
import { tilesFor, useSettings } from '../../state/settings.ts';
import { useWorkflow } from '../../state/workflow.ts';

export function StepProfile({ onNext }: { onNext: () => void }) {
  const { t, lang } = useT();
  const wf = useWorkflow();
  const settings = useSettings();
  const { format, label } = useMetricFormat();
  const [profiles, setProfiles] = useState<ProfileDTO[]>([]);
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [history, setHistory] = useState<{ profile: ProfileDTO; tests: TestRecord[] } | null>(null);

  const authStatus = useAuth((a) => a.status);
  const syncedAt = useSyncState().lastSyncAt;
  const load = async () => {
    // lokaler Modus: Standardgruppe selbst anlegen; mit Server kommen Gruppen aus dem Abgleich
    if (authStatus === 'local') await ensureDefaultGroup();
    setProfiles(await localRepo.profiles.list());
    setGroups(await localRepo.groups.list());
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- neu laden nach Anmeldung/Abgleich
  }, [authStatus, syncedAt]);

  const shown = useMemo(
    () =>
      profiles
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q.toLowerCase()) &&
            (!groupFilter || p.groupIds.includes(groupFilter)),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [profiles, q, groupFilter],
  );

  const showHistory = async (p: ProfileDTO) =>
    setHistory({ profile: p, tests: await localRepo.tests.byProfile(p.id) });

  return (
    <div className="grid gap-4">
      <Card
        title={t('profile.title')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)} data-testid="profile-new">
            + {t('profile.new')}
          </Button>
        }
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_220px]">
          <input
            className="input"
            placeholder={t('profile.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('profile.search')}
            data-testid="profile-search"
          />
          <select
            className="input"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            aria-label={t('profile.group')}
          >
            <option value="">
              {t('profile.group')}: {t('common.all')}
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {shown.length === 0 && <p className="text-muted">{t('profile.noProfiles')}</p>}
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const sel = wf.profile?.id === p.id;
            const age = ageYears(p.dateOfBirth);
            return (
              <li
                key={p.id}
                className={`rounded-xl border p-3 ${sel ? 'border-primary bg-surface2' : 'border-line'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-semibold">{p.name}</div>
                    <div className="text-sm text-muted">
                      {[
                        age !== null ? t('profile.age', { years: age }) : null,
                        p.sport,
                        p.weightKg ? `${p.weightKg} kg` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  {sel && <span className="chip">{t('profile.selected')}</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant={sel ? 'default' : 'primary'}
                    className="flex-1"
                    onClick={() => wf.setProfile(p)}
                    data-testid={`profile-select-${p.name}`}
                  >
                    {t('profile.select')}
                  </Button>
                  <Button onClick={() => void showHistory(p)}>{t('profile.previous')}</Button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => wf.setGuest(true)}
            data-testid="profile-guest"
            className={wf.guest ? '!border-primary' : ''}
          >
            {t('profile.guest')}
          </Button>
          <span className="flex-1" />
          <Button
            variant="primary"
            size="lg"
            disabled={!wf.profile && !wf.guest}
            onClick={onNext}
            data-testid="next-button"
          >
            {t('common.next')} →
          </Button>
        </div>
      </Card>

      {creating && (
        <Modal title={t('profile.new')} onClose={() => setCreating(false)} wide>
          <ProfileForm
            initial={emptyProfile(groups[0] ? [groups[0].id] : [])}
            groups={groups}
            onCancel={() => setCreating(false)}
            onSave={async (p) => {
              await localRepo.profiles.put(p);
              await localRepo.outbox.add('profile', p.id);
              setCreating(false);
              await load();
              wf.setProfile(p);
            }}
          />
        </Modal>
      )}

      {history && (
        <Modal
          title={`${t('profile.previous')} – ${history.profile.name}`}
          onClose={() => setHistory(null)}
          wide
        >
          {history.tests.length === 0 ? (
            <Banner>{t('profile.previous.none')}</Banner>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>{t('review.testName')}</th>
                  <th>#</th>
                  {tilesFor(settings, history.tests[0]!.testType)
                    .slice(0, 3)
                    .map((k) => (
                      <th key={k}>{label(k)}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {history.tests.map((tst) => {
                  const keys = tilesFor(settings, tst.testType).slice(0, 3);
                  const sums = summarize(tst.reps, keys);
                  return (
                    <tr key={tst.id}>
                      <td>
                        {TEST_TYPE_INFO[tst.testType].label[lang]}
                        <div className="text-xs text-muted">{formatDateTime(tst.createdAt, lang)}</div>
                      </td>
                      <td>{tst.reps.filter((r) => r.included).length}</td>
                      {sums.map((s) => (
                        <td key={s.key}>{format(s.key, s.mean)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}
