import { TEST_TYPES, TEST_TYPE_INFO } from '@buildr/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Card, Chip } from '../../components/ui.tsx';
import { useRefData } from '../../hub/hooks.ts';
import { useTests } from '../../hub/testsData.ts';
import { useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { formatDateTime } from '../../lib/format.ts';

const PAGE = 50;

/** Alle Tests (Server + lokal) mit Filtern nach Athlet, Testtyp und Zeitraum. */
export function TestsPage() {
  const { t, lang } = useT();
  const data = useRefData();
  const [profileId, setProfileId] = useState('');
  const [testType, setTestType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const filter = useMemo(
    () => ({
      profileId: profileId || undefined,
      testType: testType || undefined,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    }),
    [profileId, testType, from, to],
  );
  const { tests, offline, loading } = useTests(filter);
  const names = useMemo(() => new Map(data.profiles.map((p) => [p.id, p.name])), [data.profiles]);
  const tagName = useMemo(() => new Map(data.tags.map((x) => [x.id, x.name])), [data.tags]);
  const pages = Math.max(1, Math.ceil(tests.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const visible = tests.slice(cur * PAGE, (cur + 1) * PAGE);

  return (
    <div className="grid gap-4">
      {offline && <Banner tone="warn">{t('tests.offline')}</Banner>}
      <Card title={`${t('tests.title')} · ${t('tests.count', { n: tests.length })}`}>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">{t('tests.filter.athlete')}</span>
            <select
              className="input min-h-10 w-56"
              value={profileId}
              onChange={(e) => {
                setProfileId(e.target.value);
                setPage(0);
              }}
              data-testid="tests-athlete"
            >
              <option value="">{t('tests.filter.all')}</option>
              {[...data.profiles]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">{t('tests.filter.type')}</span>
            <select
              className="input min-h-10 w-56"
              value={testType}
              onChange={(e) => {
                setTestType(e.target.value);
                setPage(0);
              }}
              data-testid="tests-type"
            >
              <option value="">{t('tests.filter.all')}</option>
              {TEST_TYPES.map((x) => (
                <option key={x} value={x}>
                  {TEST_TYPE_INFO[x].label[lang]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">{t('tests.filter.from')}</span>
            <input
              type="date"
              className="input min-h-10 w-44"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">{t('tests.filter.to')}</span>
            <input
              type="date"
              className="input min-h-10 w-44"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        {!loading && tests.length === 0 ? (
          <p className="py-6 text-center text-muted" data-testid="tests-empty">
            {t('tests.empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base" data-testid="tests-table">
              <thead>
                <tr>
                  <th scope="col">{t('pp.col.date')}</th>
                  <th scope="col">{t('tests.filter.athlete')}</th>
                  <th scope="col">{t('pp.col.type')}</th>
                  <th scope="col">{t('pp.col.reps')}</th>
                  <th scope="col">{t('pp.col.tags')}</th>
                  <th scope="col">{t('pp.col.status')}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {visible.map((tt) => (
                  <tr key={tt.id}>
                    <td className="whitespace-nowrap">{formatDateTime(tt.createdAt, lang)}</td>
                    <td className="font-semibold">{tt.profileId ? (names.get(tt.profileId) ?? '?') : '–'}</td>
                    <td>{TEST_TYPE_INFO[tt.testType].label[lang]}</td>
                    <td className="tabular-nums">{tt.reps.filter((r) => r.included && !r.leadIn).length}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {tt.tagIds.map((g) => (
                          <Chip key={g}>{tagName.get(g) ?? '?'}</Chip>
                        ))}
                      </span>
                    </td>
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
                        data-testid={`test-open-${tt.id}`}
                      >
                        {t('session.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              ←
            </button>
            <span className="text-sm text-muted">{t('profiles.page', { page: cur + 1, pages })}</span>
            <button className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
              →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
