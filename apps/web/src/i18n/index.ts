import { de, type MessageKey } from './de.ts';
import { en } from './en.ts';

export type Lang = 'de' | 'en';
export type { MessageKey };

const DICTS: Record<Lang, Record<MessageKey, string>> = { de, en };

export function translate(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? DICTS.de[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/** Übersetzt einen Analyse-Warncode (`warn.<code>`), Fallback auf den Code selbst. */
export function translateWarning(lang: Lang, code: string, params?: Record<string, string | number>): string {
  const key = `warn.${code}` as MessageKey;
  return key in de ? translate(lang, key, params) : code;
}

export const messageKeys = Object.keys(de) as MessageKey[];
