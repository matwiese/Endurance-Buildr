import { TEST_TYPES, getMetric } from '@buildr/core';
import { computeLeaderboard, type ProfileDTO, type SessionDTO, type TestRecord } from '@buildr/shared';
import { useMemo } from 'react';
import { Button, Chip, Modal, ScrollArea } from '../components/ui.tsx';
import { useMetricFormat, useT } from '../i18n/hooks.ts';
import type { MessageKey } from '../i18n/index.ts';
import { download } from '../lib/format.ts';
import { sessionResultsCsv } from './export.ts';
import { defaultMetricFor, isAsymmetry } from './metrics.ts';
import { progress } from './queue.ts';

/** Zwischenstand (Pause) bzw. Abschlussübersicht der Session mit CSV-Export. */
export function SessionSummary({
  session,
  profiles,
  tests,
  variant,
  onClose,
  actions,
}: {
  session: SessionDTO;
  profiles: Map<string, ProfileDTO>;
  tests: TestRecord[];
  variant: 'pause' | 'finish';
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const { t, lang } = useT();
  const { format } = useMetricFormat();
  const p = progress(session);
  const testType =
    session.board.testType ??
    (session.mode !== 'auto'
      ? session.mode
      : (TEST_TYPES.find((x) => tests.some((tt) => tt.testType === x)) ?? 'cmj'));
  const metric = session.board.metric ?? defaultMetricFor(testType);
  const rows = useMemo(
    () =>
      metric
        ? computeLeaderboard(
            tests,
            session.queue.map((q) => q.profileId),
            {
              testType,
              metric,
              aggregate: session.board.aggregate,
              higherIsBetter: getMetric(metric)?.higherIsBetter ?? null,
              asymmetry: isAsymmetry(metric),
            },
          )
        : [],
    [tests, session, testType, metric],
  );
  return (
    <Modal
      title={variant === 'pause' ? t('session.paused') : t('session.finished.title')}
      onClose={onClose}
      wide
    >
      {variant === 'pause' && <p className="mb-3 text-muted">{t('session.paused.hint')}</p>}
      <p className="mb-3 font-semibold" data-testid="summary-progress">
        {t('session.summary.done', { done: p.done, total: p.total })}
      </p>
      <ScrollArea className="max-h-80 overflow-auto rounded-xl border border-line">
        <table className="table-base" data-testid="summary-table">
          <thead>
            <tr>
              <th scope="col">{t('board.rank')}</th>
              <th scope="col">{t('board.athlete')}</th>
              <th scope="col">{t('board.value')}</th>
              <th scope="col">{t('board.tests')}</th>
              <th scope="col">
                <span className="sr-only">{t('common.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const q = session.queue.find((x) => x.profileId === r.profileId);
              return (
                <tr key={r.profileId}>
                  <td className="tabular-nums">{r.rank ?? '–'}</td>
                  <td className="font-semibold">{profiles.get(r.profileId)?.name ?? '?'}</td>
                  <td className="tabular-nums">
                    {r.value === null || !metric
                      ? '–'
                      : isAsymmetry(metric)
                        ? `${r.value.toFixed(1)} %`
                        : format(metric, r.value)}
                  </td>
                  <td className="tabular-nums">{r.tests}</td>
                  <td>{q && <Chip>{t(`queue.status.${q.status}` as MessageKey)}</Chip>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <Button
          onClick={() =>
            download(
              `${session.name.replace(/[^\w.-]+/g, '_')}.csv`,
              sessionResultsCsv(tests, profiles, lang),
              'text/csv;charset=utf-8',
            )
          }
          data-testid="session-export"
        >
          ⭳ {t('session.export')}
        </Button>
        {actions}
        <Button onClick={onClose}>{t('common.close')}</Button>
      </div>
    </Modal>
  );
}
