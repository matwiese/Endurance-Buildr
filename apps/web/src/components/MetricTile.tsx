import { getMetric } from '@buildr/core';
import { useMetricFormat } from '../i18n/hooks.ts';

/** Kennzahl-Kachel: Bezeichnung, groß der Wert (inkl. Einheit); Asymmetrie mit Seitenangabe („R 5,2 %“). */
export function MetricTile({
  metricKey,
  value,
  compact,
}: {
  metricKey: string;
  value: number | null | undefined;
  compact?: boolean;
}) {
  const { label, format, description } = useMetricFormat();
  const def = getMetric(metricKey);
  const txt = format(metricKey, value);
  const side =
    def?.kind === 'asymmetry' && typeof value === 'number' ? (value > 0 ? 'R' : value < 0 ? 'L' : '') : '';
  return (
    <div
      className="rounded-xl border border-line bg-surface2 px-3 py-2"
      title={description(metricKey)}
      data-testid={`tile-${metricKey}`}
    >
      <div className="truncate text-xs font-medium text-muted">{label(metricKey)}</div>
      <div
        className={`font-bold tabular-nums ${compact ? 'text-lg' : 'text-2xl'} ${side ? (side === 'R' ? 'text-right-plate' : 'text-left-plate') : ''}`}
      >
        {txt}
      </div>
    </div>
  );
}
