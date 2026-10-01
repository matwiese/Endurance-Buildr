import { profilesToCsv, type ProfileDTO } from '@buildr/shared';
import { useMemo, useState } from 'react';
import { Banner, Button, Card, Chip, Modal } from '../../components/ui.tsx';
import { emptyProfile, ProfileForm } from '../../components/ProfileForm.tsx';
import { bulkGroup, removeProfile, saveProfile } from '../../hub/services.ts';
import { useRefData } from '../../hub/hooks.ts';
import { useT } from '../../i18n/hooks.ts';
import { ageYears, download } from '../../lib/format.ts';
import { useRole } from '../../state/auth.ts';
import { ImportDialog } from './ImportDialog.tsx';

const PAGE_SIZE = 50;
type SortKey = 'name' | 'age' | 'sport';

export function ProfilesPage() {
  const { t } = useT();
  const role = useRole();
  const canWrite = role !== 'viewer';
  const canDelete = role === 'admin';
  const data = useRefData();
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProfileDTO | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const groupName = useMemo(() => new Map(data.groups.map((g) => [g.id, g.name])), [data.groups]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.profiles.filter(
      (p) =>
        (!groupFilter || p.groupIds.includes(groupFilter)) &&
        (!needle ||
          p.name.toLowerCase().includes(needle) ||
          (p.sport ?? '').toLowerCase().includes(needle) ||
          (p.externalId ?? '').toLowerCase().includes(needle)),
    );
    const val = (p: ProfileDTO): string | number =>
      sort.key === 'age' ? (ageYears(p.dateOfBirth) ?? -1) : sort.key === 'sport' ? (p.sport ?? '') : p.name;
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
      return (c || a.name.localeCompare(b.name)) * sort.dir;
    });
  }, [data.profiles, q, groupFilter, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);
  const selectedProfiles = data.profiles.filter((p) => selected.has(p.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  const defaultGroupIds = groupFilter ? [groupFilter] : data.groups[0] ? [data.groups[0].id] : [];

  const sortBtn = (key: SortKey, label: string) => (
    <button
      type="button"
      className="font-semibold uppercase tracking-wide"
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
    >
      {label}
      {sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </button>
  );
  const ariaSort = (key: SortKey) =>
    sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none';

  const exportCsv = () => {
    const list = selectedProfiles.length ? selectedProfiles : rows;
    download('athleten.csv', profilesToCsv(list, data.groups), 'text/csv;charset=utf-8');
  };

  const doBulk = async (mode: 'add' | 'remove') => {
    if (!bulkGroupId) return;
    const r = await bulkGroup(selectedProfiles, bulkGroupId, mode);
    setMessage(t('profiles.bulk.result', r));
  };

  const doDelete = async () => {
    for (const p of selectedProfiles) await removeProfile(p.id);
    setSelected(new Set());
    setConfirmDelete(false);
    setTyped('');
  };

  return (
    <div className="grid gap-4">
      <Card
        title={
          <span>
            {t('profiles.title')}{' '}
            <span className="text-base font-normal text-muted">
              · {t('profiles.count', { n: rows.length })}
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={exportCsv} data-testid="profiles-export">
              ⭳ {t('profiles.export')}
            </Button>
            {canWrite && (
              <>
                <Button size="sm" onClick={() => setImporting(true)} data-testid="profiles-import">
                  ⭱ {t('profiles.import')}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setEditing(emptyProfile(defaultGroupIds))}
                  data-testid="hub-profile-new"
                >
                  + {t('profile.new')}
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_240px]">
          <input
            className="input"
            placeholder={t('profiles.search')}
            aria-label={t('common.search')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            data-testid="profiles-search"
          />
          <select
            className="input"
            aria-label={t('profile.group')}
            value={groupFilter}
            onChange={(e) => {
              setGroupFilter(e.target.value);
              setPage(0);
            }}
            data-testid="profiles-group-filter"
          >
            <option value="">{t('profiles.filter.all')}</option>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {selected.size > 0 && (
          <div
            className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-surface2 p-3"
            data-testid="bulk-bar"
          >
            <b>{t('profiles.selected', { n: selected.size })}</b>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t('profiles.clearSel')}
            </Button>
            {canWrite && (
              <>
                <select
                  className="input min-h-10 w-52"
                  aria-label={t('profiles.bulk.group')}
                  value={bulkGroupId}
                  onChange={(e) => setBulkGroupId(e.target.value)}
                  data-testid="bulk-group"
                >
                  <option value="">{t('profiles.bulk.group')}</option>
                  {data.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!bulkGroupId}
                  onClick={() => void doBulk('add')}
                  data-testid="bulk-add"
                >
                  {t('profiles.bulk.add')}
                </Button>
                <Button
                  size="sm"
                  disabled={!bulkGroupId}
                  onClick={() => void doBulk('remove')}
                  data-testid="bulk-remove"
                >
                  {t('profiles.bulk.remove')}
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setConfirmDelete(true)}
                data-testid="bulk-delete"
              >
                {t('profiles.delete')}
              </Button>
            )}
          </div>
        )}
        {message && (
          <Banner tone="info">
            <span data-testid="bulk-result">{message}</span>
          </Banner>
        )}

        {data.loaded && data.profiles.length === 0 ? (
          <p className="py-8 text-center text-muted" data-testid="profiles-empty">
            {t('profiles.empty')}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted">{t('profiles.noMatch')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base" data-testid="profiles-table">
              <thead>
                <tr>
                  <th scope="col" className="w-10">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      aria-label={t('profiles.selectAll')}
                      checked={allVisibleSelected}
                      onChange={(e) =>
                        setSelected((s) => {
                          const n = new Set(s);
                          for (const p of visible) {
                            if (e.target.checked) n.add(p.id);
                            else n.delete(p.id);
                          }
                          return n;
                        })
                      }
                      data-testid="select-all"
                    />
                  </th>
                  <th scope="col" aria-sort={ariaSort('name')}>
                    {sortBtn('name', t('profiles.col.name'))}
                  </th>
                  <th scope="col" aria-sort={ariaSort('age')}>
                    {sortBtn('age', t('profiles.col.age'))}
                  </th>
                  <th scope="col">{t('profiles.col.sex')}</th>
                  <th scope="col" aria-sort={ariaSort('sport')}>
                    {sortBtn('sport', t('profiles.col.sport'))}
                  </th>
                  <th scope="col">{t('profiles.col.groups')}</th>
                  <th scope="col">{t('profiles.col.consent')}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const age = ageYears(p.dateOfBirth);
                  return (
                    <tr
                      key={p.id}
                      data-testid={`profile-row-${p.name}`}
                      className={selected.has(p.id) ? 'bg-surface2' : ''}
                    >
                      <td>
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          aria-label={p.name}
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                        />
                      </td>
                      <td className="font-semibold">{p.name}</td>
                      <td className="tabular-nums">{age === null ? '–' : age}</td>
                      <td>{p.sex ? t(`profile.sex.${p.sex}` as 'profile.sex.f') : '–'}</td>
                      <td>{p.sport ?? '–'}</td>
                      <td>
                        <span className="flex flex-wrap gap-1">
                          {p.groupIds.map((g) => (
                            <Chip key={g}>{groupName.get(g) ?? '?'}</Chip>
                          ))}
                        </span>
                      </td>
                      <td>
                        <Chip tone={p.healthConsentAt ? 'ok' : 'warn'}>
                          {p.healthConsentAt ? t('profiles.consent.yes') : t('profiles.consent.no')}
                        </Chip>
                      </td>
                      <td className="text-right">
                        {canWrite && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(p)}
                            data-testid={`profile-edit-${p.name}`}
                          >
                            {t('common.edit')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              ←
            </Button>
            <span className="text-sm text-muted">{t('profiles.page', { page: cur + 1, pages })}</span>
            <Button size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
              →
            </Button>
          </div>
        )}
      </Card>

      {editing && (
        <Modal
          title={data.profiles.some((p) => p.id === editing.id) ? t('profiles.edit') : t('profile.new')}
          onClose={() => setEditing(null)}
          wide
        >
          <ProfileForm
            initial={editing}
            groups={data.groups}
            onCancel={() => setEditing(null)}
            onSave={async (p) => {
              await saveProfile(p);
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {importing && (
        <ImportDialog
          existing={data.profiles}
          groups={data.groups}
          categoryId={data.categories[0]?.id ?? null}
          onClose={() => setImporting(false)}
        />
      )}
      {confirmDelete && (
        <Modal title={t('profiles.delete.title')} onClose={() => setConfirmDelete(false)}>
          <p className="mb-3">{t('profiles.delete.confirm', { n: selectedProfiles.length })}</p>
          <label className="label" htmlFor="del-word">
            {t('profiles.delete.type', { word: t('profiles.delete.word') })}
          </label>
          <input
            id="del-word"
            className="input mb-4"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-testid="delete-word"
          />
          <div className="flex justify-end gap-3">
            <Button onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={typed.trim().toLocaleUpperCase() !== t('profiles.delete.word')}
              onClick={() => void doDelete()}
              data-testid="delete-confirm"
            >
              {t('profiles.delete')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
