import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEST_TYPES, TEST_TYPE_INFO, allMetrics, metricsForFamily, renderMetricsDoc } from '../src/index.ts';

describe('Metrik-Registry', () => {
  const metrics = allMetrics();
  it('hat eindeutige Schlüssel und vollständige Definitionen (Label/Beschreibung de+en, Einheit, Formel)', () => {
    const keys = new Set<string>();
    for (const m of metrics) {
      expect(keys.has(m.key), `doppelt: ${m.key}`).toBe(false);
      keys.add(m.key);
      expect(m.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(m.label.de.length, m.key).toBeGreaterThan(2);
      expect(m.label.en.length, m.key).toBeGreaterThan(2);
      expect(m.description.de.length, m.key).toBeGreaterThan(10);
      expect(m.description.en.length, m.key).toBeGreaterThan(10);
      expect(m.formula.length, m.key).toBeGreaterThan(3);
      expect(m.families.length, m.key).toBeGreaterThan(0);
      expect(typeof m.compute).toBe('function');
    }
    expect(metrics.length).toBeGreaterThan(40);
  });

  it('Asymmetrie-Metriken: Einheit %, Typ asymmetry, Schlüsselpräfix asym_', () => {
    for (const m of metrics.filter((x) => x.kind === 'asymmetry')) {
      expect(m.key.startsWith('asym_')).toBe(true);
      expect(m.unit).toBe('%');
    }
    for (const m of metrics.filter((x) => x.key.startsWith('asym_'))) expect(m.kind).toBe('asymmetry');
  });

  it('jede Test-Familie mit Sprung/Kontakt hat Metriken', () => {
    for (const t of TEST_TYPES) {
      const fam = TEST_TYPE_INFO[t].family;
      if (fam === 'isometric' || fam === 'balance') continue;
      expect(metricsForFamily(fam).length, fam).toBeGreaterThan(5);
    }
  });

  it('docs/metrics.md ist aktuell (pnpm docs:metrics ausführen, falls dieser Test rot ist)', () => {
    const onDisk = readFileSync(new URL('../../../docs/metrics.md', import.meta.url), 'utf8');
    expect(onDisk).toBe(renderMetricsDoc());
  });
});
