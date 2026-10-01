import { formatMetricValue, getMetric, type MetricDefinition } from '@buildr/core';
import { useCallback } from 'react';
import { useSettings } from '../state/settings.ts';
import { translate, translateWarning, type MessageKey } from './index.ts';

export function useT() {
  const lang = useSettings((s) => s.lang);
  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  );
  const tw = useCallback(
    (code: string, params?: Record<string, string | number>) => translateWarning(lang, code, params),
    [lang],
  );
  return { t, tw, lang };
}

/** Metrik-Anzeige gemäß Sprache und Einheitensystem (Einstellungen). */
export function useMetricFormat() {
  const lang = useSettings((s) => s.lang);
  const system = useSettings((s) => s.unitSystem);
  const label = useCallback((key: string): string => getMetric(key)?.label[lang] ?? key, [lang]);
  const description = useCallback((key: string): string => getMetric(key)?.description[lang] ?? '', [lang]);
  const format = useCallback(
    (key: string, value: number | null | undefined, withUnit = true): string => {
      const def = getMetric(key);
      return def
        ? formatMetricValue(def, value, { system, locale: lang, withUnit })
        : value == null
          ? '–'
          : String(value);
    },
    [lang, system],
  );
  const def = useCallback((key: string): MetricDefinition | undefined => getMetric(key), []);
  return { label, description, format, def, lang, system };
}
