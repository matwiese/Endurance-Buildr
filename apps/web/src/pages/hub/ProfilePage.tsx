import { TEST_TYPE_INFO, TEST_TYPES, getMetric, type TestType } from '@buildr/core';
import { buildProgress, type Aggregate } from '@buildr/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LineChart } from '../../components/Charts.tsx';
import { ProfileForm } from '../../components/ProfileForm.tsx';
import { Banner, Button, Card, Chip, Modal } from '../../components/ui.tsx';
import { useRefData } from '../../hub/hooks.ts';
import { useActiveNorms } from '../../hub/norms.ts';
import { saveProfile } from '../../hub/services.ts';
import { useTests } from '../../hub/testsData.ts';
import { useMetricFormat, useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { ageYears, formatDate } from '../../lib/format.ts';
import { defaultMetricFor, metricOptionsFor } from '../../session/metrics.ts';
import { useRole } from '../../state/auth.ts';

const AGGS: Aggregate[] = ['best', 'mean', 'last'];

/** Athletenprofil: Stammdaten, Verlauf einer Kennzahl (Baseline, Norm-Band) und Testliste. */
export function ProfilePage() {
  const { id = '' } = useParams();
  const { t, lang } = useT();
  const { label, format } = useMetricFormat();
  const navigate = useNavigate();
  const role = useRole();
  const data = useRefData();
  const profile = data.profiles.find((p) => p.id === id);
  const { tests, offline, loading } = useTests({ profileId: id });
  const { rows: normRows, set: normSet } = useActiveNorms();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<TestType | ''>('');
  const [metric, setMetric] = useState('');
  const [aggregate, setAggregate] = useState<Aggregate>('best');
  const [baselineN, setBaselineN] = useState(3);

  const types = useMemo(() => TEST_TYPES.filter((x) => tests.some((tt) => tt.testType === x)), [tests]);
  const activeType: TestType | null = (type && types.includes(type) ? type : types[0]) ?? null;
  const options = useMemo(() => (activeType ? metricOptionsFor(activeType) : []), [activeType]);
  const activeMetric =
    metric && options.some((m) => m.key === metric)
      ? metric
      : activeType
        ? defaultMetricFor(activeType)
        : null;
  const def = activeMetric ? getMetric(activeMetric) : undefined;

  const progress = useMemo(
    () =>
      profile && activeType && activeMetric
        ? buildProgress(tests, profile, {
            testType: activeType,
            metric: activeMetric,
            aggregate,
            baselineN,
            norms: normRows,
          })
        : null,
    [tests, profile, activeType, activeMetric, aggregate, baselineN, normRows],
  );

  if (!data.loaded) return <div className="p-6 text-center text-muted">…</div>;
  if (!profile) {
    return (
      <Banner tone="warn">
        {t('profiles.noMatch')} <Link to="/hub/athletes">{t('pp.back')}</Link>
      </Banner>
    );
  }
  const age = ageYears(profile.dateOfBirth);
  const last = progress?.points[progress.points.length - 1];
  const norm = progress?.norm;
  const bandSd = norm && norm.mean !== null && norm.sd !== null ? { mean: norm.mean, sd: norm.sd } : null;
  const groupName = new Map(data.groups.map((g) => [g.id, g.name]));
  const fmt = (v: number): string => (activeMetric ? format(activeMetric, v) : String(v));

  return (
    <div className="grid gap-4" data-testid="profile-page">
      <Card
        title={
          <span className="flex items-center gap-3">
            <Link to="/hub/athletes" className="text-base font-normal text-muted hover:text-text">
              {t('pp.back')}
            </Link>
            <span data-testid="pp-name">{profile.name}</span>
          </span>
        }
        actions={
          role !== 'viewer' && (
            <Button size="sm" onClick={() => setEditing(true)} data-testid="pp-edit">
              {t('common.edit')}
            </Button>
          )
        }
      >
        <div className="flex flex-wrap gap-2">
          {age !== null && <Chip>{t('profile.age', { years: age })}</Chip>}
          {profile.sex && <Chip>{t(`profile.sex.${profile.sex}` as 'profile.sex.f')}</Chip>}
          {profile.sport && <Chip>{profile.sport}</Chip>}
          {profile.heightCm && <Chip>{profile.heightCm} cm</Chip>}
          {profile.weightKg && <Chip>{profile.weightKg} kg</Chip>}
          {profile.groupIds.map((g) => (
            <Chip key={g} tone="primary">
              {groupName.get(g) ?? '?'}
            </Chip>
          ))}
          <Chip tone={profile.healthConsentAt ? 'ok' : 'warn'}>
            {t('profiles.col.consent')}:{' '}
            {profile.healthConsentAt ? t('profiles.consent.yes') : t('profiles.consent.no')}
          </Chip>
        </div>
      </Card>

      {offline && <Banner tone="warn">{t('tests.offline')}</Banner>}

      <Card title={t('pp.progress')}>
        {!loading && types.length === 0 ? (
          <p className="text-muted" data-testid="pp-empty">
            {t('pp.noTests')}
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted">{t('rep.type')}</span>
                <select
                  className="input min-h-10 w-56"
                  value={activeType ?? ''}
                  onChange={(e) => setType(e.target.value as TestType)}
                  data-testid="pp-type"
                >
                  {types.map((x) => (
                    <option key={x} value={x}>
                      {TEST_TYPE_INFO[x].label[lang]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">{t('pp.metric')}</span>
                <select
                  className="input min-h-10 w-72"
                  value={activeMetric ?? ''}
                  onChange={(e) => setMetric(e.target.value)}
                  data-testid="pp-metric"
                >
                  {options.map((m) => (
                    <option key={m.key} value={m.key}>
                      {label(m.key)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">{t('board.aggregate')}</span>
                <select
                  className="input min-h-10 w-36"
                  value={aggregate}
                  onChange={(e) => setAggregate(e.target.value as Aggregate)}
                  data-testid="pp-aggregate"
                >
                  {AGGS.map((a) => (
                    <option key={a} value={a}>
                      {t(`board.aggregate.${a}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted">{t('pp.baseline.hint', { n: baselineN })}</span>
                <input
                  className="input min-h-10 w-24"
                  type="number"
                  min={1}
                  max={20}
                  value={baselineN}
                  onChange={(e) => setBaselineN(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  data-testid="pp-baseline-n"
                />
              </label>
            </div>

            {progress && progress.points.length > 0 ? (
              <>
                <LineChart
                  points={progress.points.map((p) => ({
                    x: Date.parse(p.at),
                    y: p.value,
                    id: p.testId,
                    title: `${formatDate(p.at, lang)}: ${fmt(p.value)}`,
                  }))}
                  baseline={progress.points.length >= 2 ? progress.baseline : null}
                  band={bandSd}
                  format={(v) => (def ? format(def.key, v, false) : String(v))}
                  formatX={(ms) => formatDate(new Date(ms).toISOString(), lang)}
                  ariaLabel={t('pp.chart.aria', { metric: activeMetric ? label(activeMetric) : '' })}
                  onPointClick={(tid) => navigate(`/hub/tests/${tid}`)}
                  labels={{ baseline: t('pp.baseline'), norm: normSet?.name ?? t('pp.norm') }}
                />
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="pp-stats">
                  <Stat label={t('pp.latest')} value={last ? fmt(last.value) : '–'} />
                  <Stat
                    label={t('pp.baseline')}
                    value={
                      progress.baseline !== null && progress.points.length >= 2 ? fmt(progress.baseline) : '–'
                    }
                  />
                  <Stat
                    label={t('pp.change')}
                    value={
                      progress.changePct === null || progress.points.length < 2
                        ? '–'
                        : `${progress.changePct > 0 ? '+' : ''}${progress.changePct.toLocaleString(lang === 'de' ? 'de-AT' : 'en-GB', { maximumFractionDigits: 1 })} %`
                    }
                    testId="pp-change"
                  />
                  <Stat
                    label={`${t('pp.z')} / ${t('pp.percentile')}`}
                    value={last && last.z !== null ? `${last.z.toFixed(2)} / ${last.percentile ?? '–'}` : '–'}
                    testId="pp-z"
                  />
                </dl>
                {!normSet ? (
                  <p className="mt-2 text-sm text-muted">{t('pp.norm.none')}</p>
                ) : !norm ? (
                  <p className="mt-2 text-sm text-warn">{t('pp.norm.nomatch')}</p>
                ) : null}
              </>
            ) : (
              <p className="text-muted">{t('pp.noTests')}</p>
            )}
          </>
        )}
      </Card>

      <Card title={`${t('pp.history')} · ${t('pp.points', { n: tests.length })}`}>
        <div className="overflow-x-auto">
          <table className="table-base" data-testid="pp-history">
            <thead>
              <tr>
                <th scope="col">{t('pp.col.date')}</th>
                <th scope="col">{t('pp.col.type')}</th>
                <th scope="col">{t('pp.col.reps')}</th>
                <th scope="col">{activeMetric ? label(activeMetric) : t('pp.col.value')}</th>
                <th scope="col">{t('pp.col.status')}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {tests.map((tt) => {
                const vals =
                  activeMetric && tt.testType === activeType
                    ? tt.reps
                        .filter((r) => r.included && !r.leadIn)
                        .map((r) => r.metrics[activeMetric])
                        .filter((v): v is number => typeof v === 'number')
                    : [];
                const best = vals.length
                  ? def?.higherIsBetter === false
                    ? Math.min(...vals)
                    : Math.max(...vals)
                  : null;
                return (
                  <tr key={tt.id}>
                    <td className="whitespace-nowrap">{formatDate(tt.createdAt, lang)}</td>
                    <td>{TEST_TYPE_INFO[tt.testType].label[lang]}</td>
                    <td className="tabular-nums">{tt.reps.filter((r) => r.included && !r.leadIn).length}</td>
                    <td className="tabular-nums">{best === null ? '–' : fmt(best)}</td>
                    <td>
                      <Chip
                        tone={tt.status === 'uploaded' ? 'ok' : tt.status === 'failed' ? 'danger' : 'warn'}
                      >
                        {t(`td.status.${tt.status}` as MessageKey)}
                      </Chip>
                    </td>
                    <td className="text-right">
                      <Link
                        className="btn btn-sm"
                        to={`/hub/tests/${tt.id}`}
                        data-testid={`pp-open-${tt.id}`}
                      >
                        {t('session.open')}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Modal title={t('profiles.edit')} onClose={() => setEditing(false)} wide>
          <ProfileForm
            initial={profile}
            groups={data.groups}
            onCancel={() => setEditing(false)}
            onSave={async (p) => {
              await saveProfile(p);
              setEditing(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface2 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-bold tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
