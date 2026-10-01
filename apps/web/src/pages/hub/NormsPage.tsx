import { TEST_TYPES, TEST_TYPE_INFO, getMetric, type TestType } from '@buildr/core';
import { normTemplateCsv, planNormImport, type NormSetDTO } from '@buildr/shared';
import { useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/NameDialog.tsx';
import { Banner, Button, Card, Chip, Field, Modal } from '../../components/ui.tsx';
import { deleteNormSet, loadNormSet, saveNormSet, useNormSets } from '../../hub/norms.ts';
import { useMetricFormat, useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { download } from '../../lib/format.ts';
import { uid } from '../../lib/uid.ts';
import { useRole } from '../../state/auth.ts';
import { useSettings } from '../../state/settings.ts';

const alnum = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const LABELS = new Map<string, TestType>(
  TEST_TYPES.flatMap((x) => [
    [alnum(TEST_TYPE_INFO[x].label.de), x] as const,
    [alnum(TEST_TYPE_INFO[x].label.en), x] as const,
  ]),
);

/** Eigene Normsets verwalten: importieren (CSV mit Vorschau), auswählen, ansehen, löschen. Es werden keine Normdaten mitgeliefert. */
export function NormsPage() {
  const { t, lang } = useT();
  const { label } = useMetricFormat();
  const role = useRole();
  const canImport = role === 'admin';
  const { sets, loaded, offline, reload } = useNormSets();
  const normSetId = useSettings((s) => s.normSetId);
  const setSettings = useSettings((s) => s.set);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [viewing, setViewing] = useState<NormSetDTO | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const plan = useMemo(() => (text.trim() ? planNormImport(text, LABELS) : null), [text]);

  const save = async () => {
    if (!plan || plan.valid.length === 0 || !name.trim()) return;
    const r = await saveNormSet({
      id: uid(),
      name: name.trim(),
      description: description.trim() || null,
      rows: plan.valid,
    });
    if (r === 'ok') {
      setMessage({ tone: 'ok', text: t('norms.import.done') });
      setText('');
      setName('');
      setDescription('');
      reload();
    } else
      setMessage({
        tone: 'danger',
        text:
          r === 'offline'
            ? t('common.error.offline')
            : r === 'forbidden'
              ? t('common.error.forbidden')
              : t('common.error.invalid'),
      });
  };

  return (
    <div className="grid gap-4">
      <Card title={t('norms.title')}>
        <p className="mb-3 text-muted">{t('norms.intro')}</p>
        {offline && <Banner tone="warn">{t('common.error.offline')}</Banner>}
        {loaded && sets.length === 0 && <p className="text-muted">{t('norms.empty')}</p>}
        <ul className="grid gap-2" data-testid="norm-list">
          {sets.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
              data-testid={`norm-${s.name}`}
            >
              <div className="mr-auto min-w-0">
                <div className="font-semibold">{s.name}</div>
                <div className="text-sm text-muted">
                  {t('norms.rows', { n: s.rowCount })}
                  {s.description ? ` · ${s.description}` : ''}
                </div>
              </div>
              {normSetId === s.id ? (
                <Chip tone="ok">{t('norms.inUse')}</Chip>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setSettings({ normSetId: s.id })}
                  data-testid={`norm-use-${s.name}`}
                >
                  {t('norms.use')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={async () => setViewing(await loadNormSet(s.id))}>
                {t('norms.view')}
              </Button>
              {canImport && (
                <Button size="sm" variant="ghost" onClick={() => setToDelete({ id: s.id, name: s.name })}>
                  {t('common.delete')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title={t('norms.import')}
        actions={
          <Button
            size="sm"
            onClick={() => download('normset-vorlage.csv', normTemplateCsv(), 'text/csv;charset=utf-8')}
            data-testid="norm-template"
          >
            ⭳ {t('norms.template')}
          </Button>
        }
      >
        {!canImport ? (
          <Banner>{t('norms.adminOnly')}</Banner>
        ) : (
          <div className="grid gap-3">
            {message && (
              <Banner tone={message.tone}>
                <span data-testid="norm-message">{message.text}</span>
              </Banner>
            )}
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label={t('norms.name')} htmlFor="n-name">
                <input
                  id="n-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="norm-name"
                />
              </Field>
              <Field label={t('norms.description')} htmlFor="n-desc">
                <input
                  id="n-desc"
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,text/csv"
                className="hidden"
                data-testid="norm-file"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setText(await f.text());
                    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
                  }
                }}
              />
              <Button onClick={() => fileRef.current?.click()}>{t('import.pick')}</Button>
              <span className="text-sm text-muted">{t('import.paste')}</span>
            </div>
            <textarea
              className="input min-h-24 font-mono text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={t('import.paste')}
              data-testid="norm-text"
            />
            {plan?.fatal && (
              <Banner tone="danger">
                <span data-testid="norm-fatal">
                  {t(`norms.fatal.${plan.fatal}` as MessageKey, { cols: plan.missing.join(', ') })}
                </span>
              </Banner>
            )}
            {plan && !plan.fatal && (
              <section>
                <p className="mb-2 font-semibold" data-testid="norm-summary">
                  {t('norms.summary', { valid: plan.valid.length, invalid: plan.invalid })}
                </p>
                <div className="max-h-72 overflow-auto rounded-xl border border-line">
                  <table className="table-base" data-testid="norm-preview">
                    <thead>
                      <tr>
                        <th scope="col">{t('norms.col.line')}</th>
                        <th scope="col">{t('norms.col.test')}</th>
                        <th scope="col">{t('norms.col.metric')}</th>
                        <th scope="col">{t('norms.col.mean')}</th>
                        <th scope="col">{t('norms.col.sd')}</th>
                        <th scope="col">{t('norms.col.issues')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.rows.slice(0, 300).map((r) => (
                        <tr key={r.line} className={r.issues.length ? 'text-danger' : ''}>
                          <td className="tabular-nums">{r.line}</td>
                          <td>{r.row ? TEST_TYPE_INFO[r.row.testType].label[lang] : '–'}</td>
                          <td>{r.row ? label(r.row.metric) : '–'}</td>
                          <td className="tabular-nums">{r.row?.mean ?? '–'}</td>
                          <td className="tabular-nums">{r.row?.sd ?? '–'}</td>
                          <td className="text-sm">
                            {r.issues
                              .map((i) => t(`norms.issue.${i.code}` as MessageKey, { value: i.value ?? '' }))
                              .join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={!plan || plan.valid.length === 0 || !name.trim()}
                onClick={() => void save()}
                data-testid="norm-save"
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)} wide>
          <div className="max-h-96 overflow-auto rounded-xl border border-line">
            <table className="table-base" data-testid="norm-rows">
              <thead>
                <tr>
                  {(['test', 'metric', 'sex', 'age', 'sport', 'n', 'mean', 'sd'] as const).map((c) => (
                    <th key={c} scope="col">
                      {t(`norms.col.${c}` as MessageKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viewing.rows.slice(0, 500).map((r, i) => (
                  <tr key={i}>
                    <td>{TEST_TYPE_INFO[r.testType].label[lang]}</td>
                    <td>{getMetric(r.metric)?.label[lang] ?? r.metric}</td>
                    <td>{r.sex ?? '–'}</td>
                    <td>
                      {r.ageMin ?? '…'}–{r.ageMax ?? '…'}
                    </td>
                    <td>{r.sport ?? '–'}</td>
                    <td className="tabular-nums">{r.n ?? '–'}</td>
                    <td className="tabular-nums">{r.mean ?? '–'}</td>
                    <td className="tabular-nums">{r.sd ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
      {toDelete && (
        <ConfirmDialog
          title={t('common.delete')}
          text={t('norms.delete.confirm', { name: toDelete.name })}
          confirmLabel={t('common.delete')}
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteNormSet(toDelete.id);
            setToDelete(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
