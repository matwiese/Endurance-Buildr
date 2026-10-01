import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de.ts';
import { en } from '../src/i18n/en.ts';
import { messageKeys, translate, translateWarning } from '../src/i18n/index.ts';

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('i18n', () => {
  it('de und en haben exakt dieselben Schlüssel', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });

  it('keine leeren Texte; Platzhalter stimmen zwischen den Sprachen überein', () => {
    for (const k of messageKeys) {
      expect(de[k], k).not.toBe('');
      expect(en[k], k).not.toBe('');
      expect(placeholders(en[k]), `Platzhalter ${k}`).toEqual(placeholders(de[k]));
    }
  });

  it('ersetzt Parameter und lässt unbekannte stehen', () => {
    expect(translate('de', 'review.testsFound', { n: 3 })).toContain('3');
    expect(translate('en', 'review.testsFound')).toContain('{n}');
  });

  it('jeder Warncode des Kerns hat eine Übersetzung', () => {
    const codes = new Set<string>();
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/(?:code: |\bwarn\()'([a-z_]+)'/g))
            codes.add(m[1]!);
        }
      }
    };
    walk(join(__dirname, '../../../packages/core/src'));
    expect(codes.size).toBeGreaterThan(15);
    const missing = [...codes].filter((c) => !(`warn.${c}` in de) && !(`err.${c}` in de));
    expect(missing).toEqual([]);
    expect(translateWarning('de', 'does_not_exist')).toBe('does_not_exist');
  });

  it("jeder in der UI verwendete Schlüssel existiert (statisch gefundene t('…')-Aufrufe)", () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.includes('/i18n/')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]!);
        }
      }
    };
    walk(join(__dirname, '../src'));
    expect(used.size).toBeGreaterThan(50);
    expect([...used].filter((k) => !(k in de))).toEqual([]);
  });
});
