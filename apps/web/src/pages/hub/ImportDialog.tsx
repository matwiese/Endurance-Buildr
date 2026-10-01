import {
  IMPORT_FIELDS,
  planProfileImport,
  type GroupDTO,
  type ImportField,
  type ImportIssue,
  type ProfileDTO,
} from '@buildr/shared';
import { useMemo, useRef, useState } from 'react';
import { Banner, Button, Modal, ScrollArea } from '../../components/ui.tsx';
import { refAdmin, saveProfiles } from '../../hub/services.ts';
import { useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { uid } from '../../lib/uid.ts';
import { useRole } from '../../state/auth.ts';

const MAX_PREVIEW = 200;

/** CSV-Import mit Spaltenzuordnung, Trockenlauf (Prüfbericht je Zeile) und Duplikaterkennung. */
export function ImportDialog({
  existing,
  groups,
  categoryId,
  onClose,
}: {
  existing: ProfileDTO[];
  groups: GroupDTO[];
  /** Kategorie für automatisch angelegte Gruppen */
  categoryId: string | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const role = useRole();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState<ImportField[] | null>(null);
  const [update, setUpdate] = useState(true);
  const [createGroups, setCreateGroups] = useState(false);
  const [defaultGroup, setDefaultGroup] = useState(groups[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const canCreateGroups = role === 'admin' && categoryId !== null;

  // Der Plan wird bei jeder Änderung neu berechnet (Trockenlauf, schreibt nichts).
  const plan = useMemo(() => {
    if (!text.trim()) return null;
    return planProfileImport(text, {
      existing,
      groups,
      defaultGroupIds: defaultGroup ? [defaultGroup] : [],
      createMissingGroups: createGroups && canCreateGroups,
      columns: mapping ?? undefined,
      updateExisting: update,
      now: new Date().toISOString(),
      newId: uid,
    });
  }, [text, mapping, update, createGroups, defaultGroup, existing, groups, canCreateGroups]);

  const importable = plan?.rows.filter((r) => r.status === 'new' || r.status === 'update') ?? [];

  const issueText = (i: ImportIssue): string =>
    t(`import.issue.${i.code}` as MessageKey, { value: i.value ?? '' });

  const run = async () => {
    if (!plan) return;
    setBusy(true);
    setError(false);
    try {
      // 1) fehlende Gruppen anlegen (nur Admin, online) und den Profilen zuordnen
      const created = new Map<string, string>();
      for (const name of plan.summary.newGroups) {
        const g: GroupDTO = { id: uid(), categoryId: categoryId!, name };
        const r = await refAdmin.saveGroup(g);
        if (r !== 'ok') throw new Error(`group:${r}`);
        created.set(name.toLowerCase(), g.id);
      }
      const profiles = importable.map((row) => {
        const extra = row.newGroups.map((n) => created.get(n.toLowerCase())).filter((x): x is string => !!x);
        return { ...row.profile!, groupIds: [...new Set([...row.profile!.groupIds, ...extra])] };
      });
      await saveProfiles(profiles);
      setDone(profiles.length);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const columns = plan?.columns ?? [];
  return (
    <Modal title={t('import.title')} onClose={onClose} wide>
      {done !== null ? (
        <>
          <Banner tone="ok">
            <span data-testid="import-done">{t('import.done', { n: done })}</span>
          </Banner>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="hidden"
              data-testid="import-file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setMapping(null);
                  setText(await f.text());
                }
              }}
            />
            <Button onClick={() => fileRef.current?.click()}>{t('import.pick')}</Button>
            <span className="text-sm text-muted">{t('import.paste')}</span>
          </div>
          <textarea
            className="input min-h-24 font-mono text-sm"
            value={text}
            onChange={(e) => {
              setMapping(null);
              setText(e.target.value);
            }}
            aria-label={t('import.paste')}
            data-testid="import-text"
          />

          {plan?.fatal && (
            <Banner tone="danger">
              <span data-testid="import-fatal">{t(`import.fatal.${plan.fatal}` as MessageKey)}</span>
            </Banner>
          )}

          {plan && plan.header.length > 0 && (
            <section aria-label={t('import.mapping')}>
              <h3 className="mb-2 font-semibold">{t('import.mapping')}</h3>
              <div className="flex flex-wrap gap-3">
                {plan.header.map((h, i) => (
                  <label key={i} className="grid gap-1 text-sm">
                    <span className="text-muted">{h || `#${i + 1}`}</span>
                    <select
                      className="input min-h-10 w-48"
                      value={columns[i] ?? 'ignore'}
                      data-testid={`import-map-${i}`}
                      onChange={(e) => {
                        const next = [...columns];
                        next[i] = e.target.value as ImportField;
                        setMapping(next);
                      }}
                    >
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {t(`import.field.${f}` as MessageKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-1">
            <label className="flex min-h-10 items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={update}
                onChange={(e) => setUpdate(e.target.checked)}
              />
              {t('import.opt.update')}
            </label>
            <label className={`flex min-h-10 items-center gap-3 ${canCreateGroups ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={createGroups && canCreateGroups}
                disabled={!canCreateGroups}
                onChange={(e) => setCreateGroups(e.target.checked)}
                data-testid="import-create-groups"
              />
              {t('import.opt.createGroups')}
            </label>
            <label className="flex flex-wrap items-center gap-3">
              {t('import.opt.defaultGroup')}
              <select
                className="input min-h-10 w-56"
                value={defaultGroup}
                onChange={(e) => setDefaultGroup(e.target.value)}
              >
                <option value="">–</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {plan && !plan.fatal && (
            <section>
              <p className="mb-2 font-semibold" data-testid="import-summary">
                {t('import.summary', {
                  new: plan.summary.new,
                  update: plan.summary.update,
                  unchanged: plan.summary.unchanged,
                  invalid: plan.summary.invalid,
                })}
              </p>
              {plan.summary.newGroups.length > 0 && (
                <p className="mb-2 text-sm">
                  {t('import.newGroups', { names: plan.summary.newGroups.join(', ') })}
                </p>
              )}
              <ScrollArea className="max-h-72 overflow-auto rounded-xl border border-line">
                <table className="table-base" data-testid="import-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('import.col.line')}</th>
                      <th scope="col">{t('import.col.status')}</th>
                      <th scope="col">{t('import.col.name')}</th>
                      <th scope="col">{t('import.col.issues')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.slice(0, MAX_PREVIEW).map((r) => (
                      <tr key={r.line}>
                        <td className="tabular-nums">{r.line}</td>
                        <td
                          className={
                            r.status === 'invalid' ? 'text-danger' : r.status === 'new' ? 'text-ok' : ''
                          }
                        >
                          {t(`import.status.${r.status}` as MessageKey)}
                        </td>
                        <td>{r.profile?.name ?? r.raw.find((c) => c.trim()) ?? ''}</td>
                        <td className="text-sm">
                          {r.issues.map((i, k) => (
                            <span
                              key={k}
                              className={`mr-3 ${i.severity === 'error' ? 'text-danger' : 'text-warn'}`}
                            >
                              {issueText(i)}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
              {plan.rows.length > MAX_PREVIEW && (
                <p className="mt-1 text-xs text-muted">… {plan.rows.length - MAX_PREVIEW}</p>
              )}
              <p className="mt-2 text-xs text-muted">
                {plan.summary.invalid > 0 && `${t('import.skipInvalid')} `}
                {t('import.consent')}
              </p>
            </section>
          )}

          {error && <Banner tone="danger">{t('import.error')}</Banner>}
          <div className="flex justify-end gap-3">
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              disabled={busy || importable.length === 0}
              onClick={() => void run()}
              data-testid="import-run"
            >
              {t('import.run')} ({importable.length})
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
