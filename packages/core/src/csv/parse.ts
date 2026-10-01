/** Minimaler RFC-4180-naher CSV-Parser/-Writer (Anführungszeichen, Trennzeichen-Erkennung, BOM). */

export type Delimiter = ',' | ';' | '\t';

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Erkennt das Trennzeichen anhand der ersten nicht-leeren Zeilen (Anführungszeichen werden ignoriert). */
export function detectDelimiter(text: string): Delimiter {
  const lines = stripBom(text)
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 8);
  const score: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const line of lines) {
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (!inQ && (ch === ',' || ch === ';' || ch === '\t')) score[ch]++;
    }
  }
  if (score[';'] > score[','] && score[';'] >= score['\t']) return ';';
  if (score['\t'] > score[','] && score['\t'] > score[';']) return '\t';
  return ',';
}

export function parseCsvText(text: string, delimiter?: Delimiter): string[][] {
  const src = stripBom(text);
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  const n = src.length;
  for (let i = 0; i < n; i++) {
    const ch = src[i]!;
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Zahl mit Dezimalpunkt ODER -komma (auch Tausendertrenner); leer/ungültig → NaN. */
export function parseNumberLoose(raw: string): number {
  let s = raw.trim().replace(/\s/g, '');
  if (s === '') return NaN;
  const hasC = s.includes(',');
  const hasD = s.includes('.');
  if (hasC && hasD) {
    // letztes Trennzeichen ist das Dezimalzeichen
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasC) s = s.replace(',', '.');
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
  opts: { delimiter?: Delimiter; decimalComma?: boolean; bom?: boolean } = {},
): string {
  const d = opts.delimiter ?? ';';
  const dc = opts.decimalComma ?? d === ';';
  const esc = (v: string | number | boolean | null | undefined): string => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
    if (typeof v === 'number' && dc) s = s.replace('.', ',');
    // CSV-Injection (Excel-Formeln) entschärfen
    if (typeof v === 'string' && /^[=+\-@]/.test(s) && !/^[+-]?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
    return /["\n\r]/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (opts.bom ? '﻿' : '') + rows.map((r) => r.map(esc).join(d)).join('\r\n') + '\r\n';
}
