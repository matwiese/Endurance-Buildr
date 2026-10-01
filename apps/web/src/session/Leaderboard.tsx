import { TEST_TYPES, TEST_TYPE_INFO, getMetric, type TestType } from '@buildr/core';
import {
  computeLeaderboard,
  type Aggregate,
  type ProfileDTO,
  type SessionDTO,
  type TestRecord,
} from '@buildr/shared';
import { useMemo, useState } from 'react';
import { useMetricFormat, useT } from '../i18n/hooks.ts';
import type { MessageKey } from '../i18n/index.ts';
import { defaultMetricFor, isAsymmetry, metricOptionsFor } from './metrics.ts';

const AGGREGATES: Aggregate[] = ['best', 'last', 'mean'];

interface Props {
  session: SessionDTO;
  profiles: Map<string, ProfileDTO>;
  tests: TestRecord[];
  /** Auswahl wird gespeichert (Session) – ohne Callback ist die Auswahl nur lokal */
  onBoardChange?: (board: Partial<SessionDTO['board']>) => void;
  /** Beamer-Darstellung: große Schrift, Auswahl dezent */
  big?: boolean;
  /** Athlet, der gerade getestet wird (hervorgehoben) */
  currentProfileId?: string | null;
}

const MEDAL = ['bg-[#d9aa76] text-[#2b1b08]', 'bg-[#c9d1d3] text-[#1d2526]', 'bg-[#b58b5b] text-[#2b1b08]'];

/** Live-Rangliste einer Session: Testtyp und Kennzahl wählbar, Wertung Bester/Letzter/Mittel, Gleichstand teilt den Platz. */
export function Leaderboard({ session, profiles, tests, onBoardChange, big, currentProfileId }: Props) {
  const { t, lang } = useT();
  const { format, label } = useMetricFormat();
  const [localBoard, setLocalBoard] = useState<Partial<SessionDTO['board']>>({});
  const [invert, setInvert] = useState(false);
  const board = { ...session.board, ...localBoard };

  const typesPresent = useMemo(() => {
    const present = new Set(tests.map((x) => x.testType));
    if (session.mode !== 'auto') present.add(session.mode);
    return TEST_TYPES.filter((x) => present.has(x));
  }, [tests, session.mode]);
  const testType: TestType =
    (board.testType && typesPresent.includes(board.testType) ? board.testType : typesPresent[0]) ?? 'cmj';
  const options = useMemo(() => metricOptionsFor(testType), [testType]);
  const metric =
    board.metric && options.some((m) => m.key === board.metric) ? board.metric : defaultMetricFor(testType);

  const choose = (patch: Partial<SessionDTO['board']>) => {
    setLocalBoard((b) => ({ ...b, ...patch }));
    onBoardChange?.(patch);
  };

  const def = metric ? getMetric(metric) : undefined;
  const rows = useMemo(
    () =>
      metric
        ? computeLeaderboard(
            tests,
            session.queue.map((q) => q.profileId),
            {
              testType,
              metric,
              aggregate: board.aggregate,
              higherIsBetter: def?.higherIsBetter ?? null,
              asymmetry: isAsymmetry(metric),
              invert,
            },
          )
        : [],
    [tests, session.queue, testType, metric, board.aggregate, def, invert],
  );

  // Asymmetrien werden als Betrag gewertet → ohne Seitenangabe anzeigen
  const fmt = (v: number): string =>
    def && isAsymmetry(def.key)
      ? `${v.toLocaleString(lang === 'de' ? 'de-AT' : 'en-GB', { maximumFractionDigits: 1 })} %`
      : format(def?.key ?? '', v);
  const max = Math.max(...rows.map((r) => (r.value === null ? 0 : Math.abs(r.value))), 0) || 1;
  const statusOf = (id: string) => session.queue.find((q) => q.profileId === id)?.status;
  const text = big ? 'text-2xl' : 'text-base';

  return (
    <section aria-label={t('board.title')} data-testid="leaderboard" className="grid gap-3">
      <div className={`flex flex-wrap items-end gap-3 ${big ? 'opacity-80' : ''}`}>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">{t('board.testType')}</span>
          <select
            className="input min-h-10 w-56"
            value={testType}
            onChange={(e) =>
              choose({
                testType: e.target.value as TestType,
                metric: defaultMetricFor(e.target.value as TestType),
              })
            }
            data-testid="board-type"
          >
            {(typesPresent.length ? typesPresent : [testType]).map((x) => (
              <option key={x} value={x}>
                {TEST_TYPE_INFO[x].label[lang]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">{t('board.metric')}</span>
          <select
            className="input min-h-10 w-72"
            value={metric ?? ''}
            onChange={(e) => choose({ metric: e.target.value })}
            data-testid="board-metric"
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
            className="input min-h-10 w-40"
            value={board.aggregate}
            onChange={(e) => choose({ aggregate: e.target.value as Aggregate })}
            data-testid="board-aggregate"
          >
            {AGGREGATES.map((a) => (
              <option key={a} value={a}>
                {t(`board.aggregate.${a}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={invert}
            onChange={(e) => setInvert(e.target.checked)}
          />
          {t('board.invert')}
        </label>
      </div>

      {rows.every((r) => r.value === null) ? (
        <p className="py-6 text-center text-muted" data-testid="board-empty">
          {t('board.empty')}
        </p>
      ) : (
        <ol className="grid gap-2" data-testid="board-rows">
          {rows.map((r) => {
            const p = profiles.get(r.profileId);
            const current = currentProfileId === r.profileId;
            const w = r.value === null ? 0 : Math.max(4, (Math.abs(r.value) / max) * 100);
            return (
              <li
                key={r.profileId}
                data-testid={`board-row-${p?.name ?? r.profileId}`}
                data-rank={r.rank ?? ''}
                className={`grid grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2 ${current ? 'border-primary bg-surface2' : 'border-line'} ${r.value === null ? 'opacity-60' : ''}`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full font-extrabold tabular-nums ${r.rank !== null && r.rank <= 3 ? MEDAL[r.rank - 1] : 'bg-surface2'} ${big ? 'h-14 w-14 text-2xl' : ''}`}
                >
                  {r.rank ?? '–'}
                </span>
                <div className="min-w-0">
                  <div className={`truncate font-semibold ${text}`}>{p?.name ?? '?'}</div>
                  <div className="mt-1 h-2 overflow-hidden rounded bg-surface2" aria-hidden>
                    <div className="h-full rounded bg-primary" style={{ width: `${w}%` }} />
                  </div>
                  <div className={`mt-0.5 text-muted ${big ? 'text-base' : 'text-xs'}`}>
                    {r.value === null ? t('board.pending') : `${t('board.tests')}: ${r.n}`}
                    {r.gap !== null && r.gap > 0 && def ? ` · −${fmt(r.gap)}` : ''}
                  </div>
                </div>
                <span
                  className={`min-w-24 text-right font-bold tabular-nums ${big ? 'text-4xl' : 'text-xl'}`}
                  data-testid={`board-value-${p?.name ?? r.profileId}`}
                >
                  {r.value === null || !def ? '–' : fmt(r.value)}
                </span>
                <span className="sr-only">
                  {statusOf(r.profileId) ? t(`queue.status.${statusOf(r.profileId)}` as MessageKey) : ''}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
