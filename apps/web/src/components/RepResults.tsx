import { TEST_TYPE_INFO, type RepResult, type TestType } from '@buildr/core';
import { useT } from '../i18n/hooks.ts';
import { tilesFor, useSettings } from '../state/settings.ts';
import { MetricTile } from './MetricTile.tsx';
import { Chip } from './ui.tsx';

export function typeLabel(type: TestType | 'unclear', lang: 'de' | 'en', unclearText: string): string {
  return type === 'unclear' ? unclearText : TEST_TYPE_INFO[type].label[lang];
}

/** Sofortergebnisse einer Rep als Kachelraster (konfigurierbare Kennzahlen je Testtyp). */
export function RepResults({
  rep,
  title,
}: {
  rep: Pick<RepResult, 'type' | 'metrics' | 'confidence' | 'side' | 'detectedType' | 'warnings'>;
  title?: string;
}) {
  const { t, tw, lang } = useT();
  const settings = useSettings();
  if (rep.type === 'unclear') {
    return (
      <div className="rounded-xl border border-warn bg-warn/10 p-3 text-sm">
        <b>{t('record.unclear')}</b>
      </div>
    );
  }
  const keys = tilesFor(settings, rep.type).filter(
    (k) => rep.metrics[k] !== null && rep.metrics[k] !== undefined,
  );
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {title && <span className="font-semibold">{title}</span>}
        <Chip tone="primary">{TEST_TYPE_INFO[rep.type].label[lang]}</Chip>
        {rep.confidence !== null && (
          <Chip tone={rep.confidence > 0.75 ? 'ok' : 'warn'}>
            {t('record.confidence', { pct: Math.round(rep.confidence * 100) })}
          </Chip>
        )}
        {rep.side !== 'both' && <Chip>{t(`results.side.${rep.side}` as 'results.side.left')}</Chip>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {keys.map((k) => (
          <MetricTile key={k} metricKey={k} value={rep.metrics[k]} />
        ))}
      </div>
      {rep.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {rep.warnings.map((w, i) => (
            <li
              key={i}
              className={
                w.severity === 'warning' ? 'text-warn' : w.severity === 'error' ? 'text-danger' : 'text-muted'
              }
            >
              ⚠ {tw(w.code, w.params)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
