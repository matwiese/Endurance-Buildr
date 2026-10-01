import {
  DEFAULT_TILE_METRICS,
  TEST_TYPE_INFO,
  TEST_TYPES,
  getMetric,
  toCsv,
  type TestType,
} from '@buildr/core';
import {
  MAX_REPORT_METRICS,
  buildReport,
  reportToRows,
  type Aggregate,
  type Report,
  type ReportMode,
} from '@buildr/shared';
import { useMemo, useState } from 'react';
import { BarChart } from '../../components/Charts.tsx';
import { Banner, Button, Card, Chip, ScrollArea } from '../../components/ui.tsx';
import { useRefData } from '../../hub/hooks.ts';
import { useActiveNorms, useNormSets } from '../../hub/norms.ts';
import { useTests } from '../../hub/testsData.ts';
import { useMetricFormat, useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { download } from '../../lib/format.ts';
import { metricOptionsFor } from '../../session/metrics.ts';
import { useSettings } from '../../state/settings.ts';

type Period = '30' | '90' | '365' | 'all' | 'custom';
type View = 'table' | 'chart' | 'groups';
const AGGS: Aggregate[] = ['best', 'mean', 'last'];
const MODES: ReportMode[] = ['value', 'zTeam', 'zNorm', 'pctChange'];
const DAY = 86_400_000;
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Berichte: Zeitraum, Gruppen, Testtyp, bis zu 20 Kennzahlen; Tabelle/Diagramm/Gruppenvergleich; z-Score (Team/Norm), % Änderung; CSV und PDF (Druck). */
export function ReportsPage() {
  const { t, lang } = useT();
  const { label, format } = useMetricFormat();
  const data = useRefData();
  const { sets } = useNormSets();
  const { rows: normRows, set: normSet } = useActiveNorms();
  const normSetId = useSettings((s) => s.normSetId);
  const setSettings = useSettings((s) => s.set);

  const [period, setPeriod] = useState<Period>('90');
  const [customFrom, setCustomFrom] = useState(() => isoDay(Date.now() - 90 * DAY));
  const [customTo, setCustomTo] = useState(() => isoDay(Date.now()));
  const [testType, setTestType] = useState<TestType>('cmj');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<string[] | null>(null);
  const [aggregate, setAggregate] = useState<Aggregate>('best');
  const [mode, setMode] = useState<ReportMode>('value');
  const [baseFrom, setBaseFrom] = useState(() => isoDay(Date.now() - 180 * DAY));
  const [baseTo, setBaseTo] = useState(() => isoDay(Date.now() - 90 * DAY));
  const [view, setView] = useState<View>('table');
  const [chartMetric, setChartMetric] = useState('');

  const options = useMemo(() => metricOptionsFor(testType), [testType]);
  const selected = useMemo(
    () =>
      (
        metrics ?? DEFAULT_TILE_METRICS[testType].filter((k) => options.some((m) => m.key === k)).slice(0, 6)
      ).filter((k) => options.some((m) => m.key === k)),
    [metrics, testType, options],
  );

  // Zeitraum in ISO
  const range = useMemo(() => {
    const now = Date.now();
    if (period === 'all')
      return { from: undefined as string | undefined, to: undefined as string | undefined };
    if (period === 'custom')
      return {
        from: new Date(`${customFrom}T00:00:00`).toISOString(),
        to: new Date(`${customTo}T23:59:59.999`).toISOString(),
      };
    return { from: new Date(now - Number(period) * DAY).toISOString(), to: undefined };
  }, [period, customFrom, customTo]);
  const baseline = useMemo(
    () =>
      mode === 'pctChange'
        ? {
            from: new Date(`${baseFrom}T00:00:00`).toISOString(),
            to: new Date(`${baseTo}T23:59:59.999`).toISOString(),
          }
        : undefined,
    [mode, baseFrom, baseTo],
  );
  const fetchFrom =
    baseline && range.from && baseline.from < range.from
      ? baseline.from
      : baseline && !range.from
        ? undefined
        : range.from;
  const { tests, offline, loading } = useTests({
    testType,
    from: fetchFrom,
    to: range.to,
    groupIds: groupIds.length ? groupIds : undefined,
  });

  const report: Report = useMemo(
    () =>
      buildReport(tests, data.profiles, data.groups, {
        testType,
        metrics: selected,
        from: range.from,
        to: range.to,
        groupIds,
        aggregate,
        mode,
        baseline,
        norms: normRows,
      }),
    [
      tests,
      data.profiles,
      data.groups,
      testType,
      selected,
      range,
      groupIds,
      aggregate,
      mode,
      baseline,
      normRows,
    ],
  );

  const shown = (m: string, v: number | null): string => {
    if (v === null) return '–';
    if (mode === 'value') return format(m, v);
    if (mode === 'pctChange') return `${v > 0 ? '+' : ''}${v.toFixed(1)} %`;
    return v.toFixed(2);
  };
  const chartKey = chartMetric && selected.includes(chartMetric) ? chartMetric : (selected[0] ?? '');
  const bars = useMemo(
    () =>
      [...report.rows]
        .map((r) => ({
          id: r.profileId,
          label: r.name,
          value: r.cells[chartKey]?.shown ?? null,
          note: r.cells[chartKey]?.band ? t(`norm.band.${r.cells[chartKey]!.band}` as MessageKey) : undefined,
        }))
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
    [report.rows, chartKey, t],
  );
  const groupBars = useMemo(
    () =>
      report.groups.map((g) => ({
        id: g.groupId,
        label: `${g.name} (n=${g.n})`,
        value: g.perMetric[chartKey]?.mean ?? null,
      })),
    [report.groups, chartKey],
  );
  const modeMean = mode === 'value' ? (report.stats[chartKey]?.mean ?? null) : null;
  const chartFmt = (v: number): string => (chartKey ? shown(chartKey, v) : String(v));
  const groupFmt = (v: number): string => (chartKey ? format(chartKey, v) : String(v));

  const exportCsv = () => {
    const rows = reportToRows(
      report,
      (m) =>
        `${label(m)}${getMetric(m)?.unit && mode === 'value' ? ` [${getMetric(m)!.unit}]` : mode === 'pctChange' ? ' [%]' : mode === 'value' ? '' : ' [z]'}`,
      {
        athlete: t('rep.athlete'),
        tests: t('rep.tests'),
        mean: t('rep.stats.mean'),
        sd: t('rep.stats.sd'),
        min: t('rep.stats.min'),
        max: t('rep.stats.max'),
      },
    );
    download(`bericht-${testType}.csv`, toCsv(rows, { delimiter: ';', bom: true }), 'text/csv;charset=utf-8');
  };

  const toggleMetric = (k: string) => {
    const cur = selected;
    if (cur.includes(k)) setMetrics(cur.filter((x) => x !== k));
    else if (cur.length < MAX_REPORT_METRICS) setMetrics([...cur, k]);
  };
  const needNorm = mode === 'zNorm' && !normSet;

  return (
    <div className="grid gap-4" data-testid="reports-page">
      <Card title={t('rep.title')} className="no-print">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Sel
              label={t('rep.period')}
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              testId="rep-period"
              w="w-48"
            >
              {(['30', '90', '365', 'all', 'custom'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`rep.period.${p}` as MessageKey)}
                </option>
              ))}
            </Sel>
            {period === 'custom' && (
              <>
                <Date_ label={t('rep.from')} value={customFrom} onChange={setCustomFrom} />
                <Date_ label={t('rep.to')} value={customTo} onChange={setCustomTo} />
              </>
            )}
            <Sel
              label={t('rep.type')}
              value={testType}
              onChange={(v) => {
                setTestType(v as TestType);
                setMetrics(null);
              }}
              testId="rep-type"
              w="w-60"
            >
              {TEST_TYPES.map((x) => (
                <option key={x} value={x}>
                  {TEST_TYPE_INFO[x].label[lang]}
                </option>
              ))}
            </Sel>
            <Sel
              label={t('rep.aggregate')}
              value={aggregate}
              onChange={(v) => setAggregate(v as Aggregate)}
              testId="rep-aggregate"
              w="w-36"
            >
              {AGGS.map((a) => (
                <option key={a} value={a}>
                  {t(`board.aggregate.${a}` as MessageKey)}
                </option>
              ))}
            </Sel>
            <Sel
              label={t('rep.mode')}
              value={mode}
              onChange={(v) => setMode(v as ReportMode)}
              testId="rep-mode"
              w="w-52"
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`rep.mode.${m}` as MessageKey)}
                </option>
              ))}
            </Sel>
            {mode === 'zNorm' && (
              <Sel
                label={t('rep.norm.set')}
                value={normSetId ?? ''}
                onChange={(v) => setSettings({ normSetId: v || null })}
                testId="rep-normset"
                w="w-56"
              >
                <option value="">–</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Sel>
            )}
          </div>
          {mode === 'pctChange' && (
            <div className="flex flex-wrap items-end gap-3">
              <span className="text-sm text-muted">{t('rep.baseline')}:</span>
              <Date_ label={t('rep.from')} value={baseFrom} onChange={setBaseFrom} testId="rep-base-from" />
              <Date_ label={t('rep.to')} value={baseTo} onChange={setBaseTo} testId="rep-base-to" />
            </div>
          )}
          <fieldset>
            <legend className="label">{t('rep.groups')}</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`chip ${groupIds.length === 0 ? 'border-primary text-primary' : ''}`}
                onClick={() => setGroupIds([])}
              >
                {t('rep.selectAll')}
              </button>
              {data.groups.map((g) => (
                <label
                  key={g.id}
                  className={`chip cursor-pointer ${groupIds.includes(g.id) ? 'border-primary text-primary' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={groupIds.includes(g.id)}
                    onChange={() =>
                      setGroupIds((cur) =>
                        cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id],
                      )
                    }
                    data-testid={`rep-group-${g.name}`}
                  />
                  {g.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">{t('rep.metrics', { max: MAX_REPORT_METRICS })}</legend>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-auto" data-testid="rep-metrics">
              {options.map((m) => {
                const on = selected.includes(m.key);
                return (
                  <label
                    key={m.key}
                    className={`chip cursor-pointer ${on ? 'border-primary bg-surface2 text-primary' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => toggleMetric(m.key)}
                      disabled={!on && selected.length >= MAX_REPORT_METRICS}
                      data-testid={`rep-metric-${m.key}`}
                    />
                    {label(m.key)}
                  </label>
                );
              })}
            </div>
            {selected.length >= MAX_REPORT_METRICS && (
              <p className="mt-1 text-xs text-warn">{t('rep.metrics.max', { max: MAX_REPORT_METRICS })}</p>
            )}
          </fieldset>
        </div>
      </Card>

      {offline && <Banner tone="warn">{t('tests.offline')}</Banner>}
      {needNorm && <Banner tone="warn">{t('rep.norm.need')}</Banner>}

      <Card
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>{TEST_TYPE_INFO[testType].label[lang]}</span>
            <span className="text-base font-normal text-muted">
              {t('profiles.count', { n: report.rows.length })}
            </span>
          </span>
        }
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="tablist">
              {(['table', 'chart', 'groups'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  className={`btn btn-sm ${view === v ? 'btn-primary' : ''}`}
                  onClick={() => setView(v)}
                  data-testid={`rep-view-${v}`}
                >
                  {t(`rep.view.${v}` as MessageKey)}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={exportCsv} disabled={report.rows.length === 0} data-testid="rep-csv">
              ⭳ {t('rep.export.csv')}
            </Button>
            <Button size="sm" onClick={() => window.print()} data-testid="rep-pdf">
              🖶 {t('rep.export.pdf')}
            </Button>
          </div>
        }
      >
        <p className="print-only mb-2 text-sm">
          {t('rep.generated', { date: new Date().toLocaleDateString(lang === 'de' ? 'de-AT' : 'en-GB') })}
        </p>
        {selected.length === 0 ? (
          <p className="text-muted">{t('rep.noMetrics')}</p>
        ) : !loading && report.rows.length === 0 ? (
          <p className="py-6 text-center text-muted" data-testid="rep-empty">
            {t('rep.empty')}
          </p>
        ) : view === 'table' ? (
          <ScrollArea className="overflow-x-auto">
            <table className="table-base" data-testid="rep-table">
              <thead>
                <tr>
                  <th scope="col">{t('rep.athlete')}</th>
                  <th scope="col">{t('rep.tests')}</th>
                  {selected.map((m) => (
                    <th key={m} scope="col" title={getMetric(m)?.unit}>
                      {label(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.profileId} data-testid={`rep-row-${r.name}`}>
                    <th scope="row" className="text-left font-semibold">
                      {r.name}
                    </th>
                    <td className="tabular-nums">{r.tests}</td>
                    {selected.map((m) => {
                      const c = r.cells[m]!;
                      const high =
                        mode !== 'value' &&
                        c.shown !== null &&
                        Math.abs(c.shown) >= (mode === 'pctChange' ? 10 : 1.5);
                      return (
                        <td
                          key={m}
                          className={`tabular-nums ${high ? 'font-bold' : ''}`}
                          data-testid={`rep-cell-${r.name}-${m}`}
                        >
                          {shown(m, c.shown)}
                          {c.percentile != null && (
                            <span className="ml-1 text-xs text-muted">P{Math.round(c.percentile)}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {(['mean', 'sd', 'min', 'max'] as const).map((k) => (
                  <tr key={k} className="text-muted" data-testid={`rep-stat-${k}`}>
                    <th scope="row" className="text-left font-semibold">
                      {t(`rep.stats.${k}` as MessageKey)}
                    </th>
                    <td className="tabular-nums">{k === 'mean' ? report.rows.length : ''}</td>
                    {selected.map((m) => {
                      const v = report.stats[m]![k];
                      return (
                        <td key={m} className="tabular-nums">
                          {v === null ? '–' : format(m, v, k !== 'sd')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tfoot>
            </table>
            {mode !== 'value' && (
              <p className="mt-2 text-xs text-muted">
                {t(('rep.mode.' + mode) as MessageKey)} · {t('rep.stats.mean')} / {t('rep.stats.sd')}:{' '}
                {t('rep.mode.value')}
              </p>
            )}
          </ScrollArea>
        ) : (
          <div className="grid gap-3">
            <label className="no-print grid w-72 gap-1 text-sm">
              <span className="text-muted">{t('rep.chart.metric')}</span>
              <select
                className="input min-h-10"
                value={chartKey}
                onChange={(e) => setChartMetric(e.target.value)}
                data-testid="rep-chart-metric"
              >
                {selected.map((m) => (
                  <option key={m} value={m}>
                    {label(m)}
                  </option>
                ))}
              </select>
            </label>
            {view === 'chart' ? (
              <BarChart
                items={bars}
                format={chartFmt}
                mean={modeMean}
                meanLabel={t('rep.mean.team')}
                ariaLabel={`${t('rep.view.chart')}: ${chartKey ? label(chartKey) : ''}`}
              />
            ) : (
              <>
                <BarChart
                  items={groupBars}
                  format={groupFmt}
                  ariaLabel={`${t('rep.view.groups')}: ${chartKey ? label(chartKey) : ''}`}
                />
                <ScrollArea className="overflow-x-auto">
                  <table className="table-base" data-testid="rep-groups-table">
                    <thead>
                      <tr>
                        <th scope="col">{t('rep.team.group')}</th>
                        <th scope="col">{t('rep.n')}</th>
                        {selected.map((m) => (
                          <th key={m} scope="col">
                            {label(m)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.groups.map((g) => (
                        <tr key={g.groupId} data-testid={`rep-group-row-${g.name}`}>
                          <th scope="row" className="text-left font-semibold">
                            {g.name}
                          </th>
                          <td className="tabular-nums">{g.n}</td>
                          {selected.map((m) => {
                            const s = g.perMetric[m]!;
                            return (
                              <td key={m} className="tabular-nums">
                                {s.mean === null
                                  ? '–'
                                  : `${format(m, s.mean, false)}${s.sd !== null ? ` ± ${format(m, s.sd, false)}` : ''}`}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </>
            )}
          </div>
        )}
        <div className="print-only mt-3 flex flex-wrap gap-2 text-xs">
          {selected.map((m) => (
            <Chip key={m}>{label(m)}</Chip>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Sel({
  label,
  value,
  onChange,
  children,
  testId,
  w,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  testId?: string;
  w: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <select
        className={`input min-h-10 ${w}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      >
        {children}
      </select>
    </label>
  );
}

function Date_({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input
        type="date"
        className="input min-h-10 w-44"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
    </label>
  );
}
