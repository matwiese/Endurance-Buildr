import { TEST_TYPE_INFO, type ForceTrace, type RepResult } from '@buildr/core';
import type { TestRecord } from '@buildr/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, NetworkError, api } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/NameDialog.tsx';
import { Banner, Button, Card, Chip, Field, ScrollArea } from '../../components/ui.tsx';
import { useRefData } from '../../hub/hooks.ts';
import { loadRecordingTrace, useTest } from '../../hub/testsData.ts';
import { useMetricFormat, useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { formatDateTime } from '../../lib/format.ts';
import { repAnnotations, repPhaseRegions, type AnnotKey } from '../../lib/repDetail.ts';
import { localRepo } from '../../offline/repo.ts';
import { PHASE_COLORS } from '../../plot/plotCore.ts';
import { TracePlot, type Annot, type Curve, type Region } from '../../plot/TracePlot.tsx';
import { useAuth, useRole } from '../../state/auth.ts';
import { tilesFor } from '../../state/settings.ts';
import { useSettings } from '../../state/settings.ts';

const ANNOT_COLOR: Record<AnnotKey, string> = {
  onset: '#6fa29a',
  vMax: '#d9aa76',
  zeroVel: '#b58b5b',
  takeoff: '#4cb782',
  landing: '#e0735a',
  peak: '#d9aa76',
};

/** Testdetail: Rohkurve mit Phasen/Ereignissen, Kennzahlen je Wiederholung und Nachbearbeitung (Notiz, Tags, Zuordnung, Ein-/Ausschluss). */
export function TestDetailPage() {
  const { id = '' } = useParams();
  const { t, lang } = useT();
  const { label, format } = useMetricFormat();
  const navigate = useNavigate();
  const role = useRole();
  const authed = useAuth((s) => s.status === 'authenticated');
  const settings = useSettings();
  const data = useRefData();
  const { test, loading, offline, refetch } = useTest(id);
  const [trace, setTrace] = useState<ForceTrace | null | 'loading'>('loading');
  const [repId, setRepId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canWrite = role !== 'viewer';

  // Formularzustand beim Laden/Wechsel des Tests übernehmen
  useEffect(() => {
    if (!test) return;
    setNotes(test.notes ?? '');
    setTagIds(test.tagIds);
    setProfileId(test.profileId);
    setIncluded(Object.fromEntries(test.reps.map((r) => [r.id, r.included])));
    setRepId((cur) => cur ?? test.reps.find((r) => r.included && !r.leadIn)?.id ?? test.reps[0]?.id ?? null);
  }, [test]);

  useEffect(() => {
    if (!test) return;
    let alive = true;
    setTrace('loading');
    void loadRecordingTrace(test.recordingId, authed).then((tr) => alive && setTrace(tr));
    return () => {
      alive = false;
    };
  }, [test, authed]);

  const rep = test?.reps.find((r) => r.id === repId) ?? null;
  const hz = trace && trace !== 'loading' ? trace.hz : 1000;

  const plot = useMemo(() => {
    if (!test || !rep || !trace || trace === 'loading') return null;
    const total = Float32Array.from(trace.left, (v, i) => v + trace.right[i]!);
    const pad = Math.round(0.6 * hz);
    const a = Math.max(0, rep.startIdx - pad);
    const b = Math.min(total.length, rep.endIdx + pad);
    const align = rep.events['onset'] ?? rep.events['contactStart'] ?? rep.startIdx;
    const data = total.slice(a, b);
    const curve: Curve = { id: 'Σ', data, t0: (a - align) / hz, hz, color: 'var(--sum)', width: 2.4 };
    const asRes = rep as unknown as RepResult;
    const regions: Region[] = repPhaseRegions(asRes).map((r) => ({
      a: (r.a - align) / hz,
      b: (r.b - align) / hz,
      color: PHASE_COLORS[r.key],
      label: r.key,
    }));
    const mass = (test.bodyMassKg ?? 0) + test.externalLoadKg;
    const annots: Annot[] = repAnnotations(asRes, total, hz, test.bodyMassKg ?? 0, test.externalLoadKg).map(
      (x) => ({
        t: (x.idx - align) / hz,
        label: t(`results.event.${x.key}` as MessageKey),
        color: ANNOT_COLOR[x.key],
      }),
    );
    return { curve, regions, annots, tMin: curve.t0, tMax: curve.t0 + data.length / hz, bw: mass * 9.80665 };
  }, [test, rep, trace, hz, t]);

  if (loading) return <div className="p-6 text-center text-muted">…</div>;
  if (!test) return <Banner tone="warn">{offline ? t('tests.offline') : t('td.notFound')}</Banner>;

  const person = test.profileId ? data.profiles.find((p) => p.id === test.profileId) : null;
  const dirty =
    notes !== (test.notes ?? '') ||
    profileId !== test.profileId ||
    JSON.stringify([...tagIds].sort()) !== JSON.stringify([...test.tagIds].sort()) ||
    test.reps.some((r) => included[r.id] !== r.included);

  const save = async () => {
    setMessage(null);
    const reps = test.reps.map((r) => ({ id: r.id, included: included[r.id] ?? r.included }));
    const patch = { notes: notes.trim() || null, tagIds, profileId, reps };
    try {
      let next: TestRecord;
      if (test.status === 'uploaded' && authed) {
        // hochgeladene Tests ändern wir serverseitig (Tests sind dort unveränderlich, `PATCH` ist der Bearbeitungsweg)
        next = await api.patch<TestRecord>(`/api/tests/${test.id}`, patch);
        const localCopy = await localRepo.tests.get(test.id);
        if (localCopy) await localRepo.tests.put({ ...next, status: 'uploaded' });
      } else if (test.status === 'uploaded') {
        setMessage({ tone: 'danger', text: t('td.error.offline') });
        return;
      } else {
        // noch nicht hochgeladen: lokale Fassung ändern – der Upload sendet den bearbeiteten Stand
        next = {
          ...test,
          notes: patch.notes,
          tagIds,
          profileId,
          reps: test.reps.map((r) => ({ ...r, included: included[r.id] ?? r.included })),
        };
        await localRepo.tests.put(next);
      }
      setMessage({ tone: 'ok', text: t('td.saved') });
      await refetch();
    } catch (e) {
      setMessage({
        tone: 'danger',
        text:
          e instanceof NetworkError
            ? t('td.error.offline')
            : e instanceof ApiError && e.status === 403
              ? t('td.error.forbidden')
              : t('common.error'),
      });
    }
  };

  const remove = async () => {
    try {
      if (test.status === 'uploaded' && authed) await api.del(`/api/tests/${test.id}`);
      else if (test.status === 'uploaded') {
        setMessage({ tone: 'danger', text: t('td.error.offline') });
        setConfirmDelete(false);
        return;
      }
      for (const o of await localRepo.outbox.list())
        if (o.kind === 'test' && o.entityId === test.id) await localRepo.outbox.remove(o.id!);
      await localRepo.tests.remove(test.id);
      navigate('/hub/tests');
    } catch (e) {
      setMessage({
        tone: 'danger',
        text: e instanceof NetworkError ? t('td.error.offline') : t('td.error.forbidden'),
      });
      setConfirmDelete(false);
    }
  };

  const tileKeys = rep && rep.type !== 'unclear' ? tilesFor(settings, rep.type) : [];
  const metricKeys = rep ? Object.keys(rep.metrics).filter((k) => rep.metrics[k] !== null) : [];

  return (
    <div className="grid gap-4" data-testid="test-detail">
      <Card
        title={
          <span className="flex items-center gap-3">
            <Link to="/hub/tests" className="text-base font-normal text-muted hover:text-text">
              {t('td.back')}
            </Link>
            <span>{TEST_TYPE_INFO[test.testType].label[lang]}</span>
          </span>
        }
        actions={
          <Chip tone={test.status === 'uploaded' ? 'ok' : test.status === 'failed' ? 'danger' : 'warn'}>
            {t(`td.status.${test.status}` as MessageKey)}
          </Chip>
        }
      >
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Meta k={t('td.athlete')}>
            {person ? <Link to={`/hub/athletes/${person.id}`}>{person.name}</Link> : '–'}
          </Meta>
          <Meta k={t('td.date')}>{formatDateTime(test.createdAt, lang)}</Meta>
          <Meta k={t('td.mass')}>{test.bodyMassKg ? `${test.bodyMassKg.toFixed(1)} kg` : '–'}</Meta>
          <Meta k={t('td.load')}>{test.externalLoadKg ? `${test.externalLoadKg} kg` : '–'}</Meta>
          <Meta k={t('td.hz')}>{test.samplingHz} Hz</Meta>
          <Meta k={t('td.device')}>{test.deviceSerial ?? '–'}</Meta>
          <Meta k={t('td.analysis')}>{test.analysisVersion}</Meta>
          <Meta k={t('td.conditions')}>
            {Object.entries(test.conditions)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(', ') || '–'}
          </Meta>
        </dl>
      </Card>

      <Card title={t('td.curve')}>
        <div className="mb-2 flex flex-wrap gap-2" role="tablist" aria-label={t('td.reps')}>
          {test.reps.map((r, i) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === repId}
              onClick={() => setRepId(r.id)}
              data-testid={`td-rep-${i}`}
              className={`btn btn-sm ${r.id === repId ? 'btn-primary' : ''} ${included[r.id] === false ? 'opacity-50' : ''}`}
            >
              {t('td.rep', { n: r.hopIndex ?? i + 1 })}
              {r.leadIn ? ' (lead-in)' : ''}
            </button>
          ))}
        </div>
        <div className="h-[36vh] min-h-64">
          {trace === 'loading' ? (
            <p className="text-muted">{t('td.curve.loading')}</p>
          ) : !trace || !plot ? (
            <p className="text-muted" data-testid="td-no-curve">
              {t('td.curve.missing')}
            </p>
          ) : (
            <TracePlot
              curves={[plot.curve]}
              regions={plot.regions}
              annots={plot.annots}
              bwN={plot.bw}
              tMin={plot.tMin}
              tMax={plot.tMax}
              ariaLabel={t('td.curve')}
              bwLabel="BW"
            />
          )}
        </div>
      </Card>

      {rep && (
        <Card
          title={`${t('td.metrics')} · ${t('td.rep', { n: rep.hopIndex ?? test.reps.indexOf(rep) + 1 })}`}
        >
          <ScrollArea className="overflow-x-auto">
            <table className="table-base" data-testid="td-metrics">
              <tbody>
                {[...new Set([...tileKeys, ...metricKeys])]
                  .filter((k) => rep.metrics[k] !== null && rep.metrics[k] !== undefined)
                  .map((k) => (
                    <tr key={k}>
                      <th scope="row" className="font-normal text-muted">
                        {label(k)}
                      </th>
                      <td className="tabular-nums font-semibold" data-testid={`td-metric-${k}`}>
                        {format(k, rep.metrics[k])}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </ScrollArea>
        </Card>
      )}

      {canWrite && (
        <Card title={t('common.edit')}>
          {message && (
            <Banner tone={message.tone}>
              <span data-testid="td-message">{message.text}</span>
            </Banner>
          )}
          <Field label={t('td.notes')} htmlFor="td-notes">
            <textarea
              id="td-notes"
              className="input min-h-20"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="td-notes"
            />
          </Field>
          <div className="grid gap-x-6 sm:grid-cols-2">
            <Field label={t('td.reassign')} htmlFor="td-profile">
              <select
                id="td-profile"
                className="input"
                value={profileId ?? ''}
                onChange={(e) => setProfileId(e.target.value || null)}
                data-testid="td-profile"
              >
                <option value="">–</option>
                {[...data.profiles]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <fieldset className="mb-3">
              <legend className="label">{t('td.tags')}</legend>
              <div className="flex flex-wrap gap-2">
                {data.tags.map((g) => (
                  <label key={g.id} className="chip cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tagIds.includes(g.id)}
                      onChange={() =>
                        setTagIds((cur) =>
                          cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id],
                        )
                      }
                    />
                    {g.name}
                  </label>
                ))}
                {data.tags.length === 0 && <span className="text-sm text-muted">–</span>}
              </div>
            </fieldset>
          </div>
          <fieldset className="mb-3">
            <legend className="label">{t('td.reps')}</legend>
            <div className="flex flex-wrap gap-3">
              {test.reps.map((r, i) => (
                <label key={r.id} className="flex min-h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={included[r.id] ?? r.included}
                    onChange={(e) => setIncluded((cur) => ({ ...cur, [r.id]: e.target.checked }))}
                    data-testid={`td-include-${i}`}
                  />
                  {t('td.rep', { n: r.hopIndex ?? i + 1 })}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="primary" disabled={!dirty} onClick={() => void save()} data-testid="td-save">
              {t('td.save')}
            </Button>
            {role === 'admin' && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)} data-testid="td-delete">
                {t('td.delete')}
              </Button>
            )}
          </div>
        </Card>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('td.delete')}
          text={t('td.delete.confirm')}
          confirmLabel={t('td.delete')}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => void remove()}
        />
      )}
    </div>
  );
}

function Meta({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
