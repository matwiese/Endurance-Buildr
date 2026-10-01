import type { ForceTrace } from '../types.ts';
import { median } from '../stats.ts';
import { parseCsvText, parseNumberLoose } from './parse.ts';

/** Von der Referenz-App mitgelieferte Analyse-Spalten („Post-analysis“), bis zum Onset 0. */
export interface ReferenceColumns {
  acceleration: Float64Array;
  velocity: Float64Array;
  height: Float64Array;
  power: Float64Array;
  impulse: Float64Array;
  /** erste Zeile mit Acceleration ≠ 0, sonst null */
  onsetIdx: number | null;
}

export interface ParsedTraceFile {
  trace: ForceTrace;
  meta: Record<string, string>;
  /** Session-Gewicht (kg) aus dem Header, falls vorhanden */
  weightKg?: number;
  /** absolute Zeit (s) der ersten Zeile */
  startTimeS: number;
  recordingDate?: string;
  reference?: ReferenceColumns;
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Liest Kraft-CSV: ForceDecks-„Raw Data Export“ (Kopfblock, Dezimalkomma, BOM, Post-Analyse-Spalten) und einfache
 * Dateien mit Spalten Time/Left/Right (Trennzeichen und Dezimalzeichen werden erkannt).
 * `hz` aus Header „Frequency“, sonst aus der Zeitspalte (Median der Differenzen), sonst Fallback.
 */
export function parseForceTraceCsv(text: string, opts: { fallbackHz?: number } = {}): ParsedTraceFile {
  const rows = parseCsvText(text);
  const meta: Record<string, string> = {};
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]!.map(norm);
    if (cells.includes('left') && cells.includes('right')) {
      headerRow = i;
      break;
    }
    if (cells.length >= 2 && cells[0] !== '') meta[rows[i]![0]!.trim()] = (rows[i]![1] ?? '').trim();
  }
  if (headerRow < 0) throw new Error('CSV: Spalten „Left“ und „Right“ nicht gefunden');
  const header = rows[headerRow]!.map(norm);
  const col = (name: string): number => header.indexOf(name);
  const iT = col('time');
  const iL = col('left');
  const iR = col('right');
  const iA = col('acceleration');
  const iV = col('velocity');
  const iH = col('height');
  const iP = col('power');
  const iI = col('impulse');

  const data = rows.slice(headerRow + 1).filter((r) => r.length >= 2 && r.some((c) => c.trim() !== ''));
  const n = data.length;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const time = new Float64Array(n);
  const hasRef = iA >= 0 && iV >= 0;
  const ref = hasRef
    ? {
        acceleration: new Float64Array(n),
        velocity: new Float64Array(n),
        height: new Float64Array(n),
        power: new Float64Array(n),
        impulse: new Float64Array(n),
      }
    : null;
  for (let i = 0; i < n; i++) {
    const r = data[i]!;
    left[i] = parseNumberLoose(r[iL] ?? '');
    right[i] = parseNumberLoose(r[iR] ?? '');
    time[i] = iT >= 0 ? parseNumberLoose(r[iT] ?? '') : i;
    if (ref) {
      ref.acceleration[i] = parseNumberLoose(r[iA] ?? '') || 0;
      ref.velocity[i] = parseNumberLoose(r[iV] ?? '') || 0;
      ref.height[i] = iH >= 0 ? parseNumberLoose(r[iH] ?? '') || 0 : 0;
      ref.power[i] = iP >= 0 ? parseNumberLoose(r[iP] ?? '') || 0 : 0;
      ref.impulse[i] = iI >= 0 ? parseNumberLoose(r[iI] ?? '') || 0 : 0;
    }
  }
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(left[i]!) || Number.isNaN(right[i]!))
      throw new Error(`CSV: ungültiger Kraftwert in Datenzeile ${i + 1}`);
  }

  let hz = parseNumberLoose(meta['Frequency'] ?? '');
  if (!(hz > 0) && iT >= 0 && n > 2) {
    const diffs = new Float64Array(Math.min(n - 1, 2000));
    for (let i = 0; i < diffs.length; i++) diffs[i] = time[i + 1]! - time[i]!;
    const dt = median(diffs);
    if (dt > 0) hz = Math.round(1 / dt);
  }
  if (!(hz > 0)) hz = opts.fallbackHz ?? 1000;

  let onsetIdx: number | null = null;
  if (ref) {
    for (let i = 0; i < n; i++) {
      if (ref.acceleration[i] !== 0) {
        onsetIdx = i;
        break;
      }
    }
  }
  const w = parseNumberLoose(meta['Weight'] ?? '');
  return {
    trace: { hz, left, right },
    meta,
    weightKg: w > 0 ? w : undefined,
    startTimeS: n > 0 && Number.isFinite(time[0]!) ? time[0]! : 0,
    recordingDate: meta['Recording Date'],
    reference: ref ? { ...ref, onsetIdx } : undefined,
  };
}
