import { TEST_TYPES, TEST_TYPE_INFO, type TestFamily } from '../testTypes.ts';
import { allMetrics } from './index.ts';
import type { MetricDefinition } from './types.ts';

const FAMILY_TITLE: Record<TestFamily, string> = {
  cmj: 'CMJ-Familie (CMJ, Loaded CMJ, Abalakov, Single Leg Jump)',
  sj: 'Squat-Jump-Familie (SJ, Loaded SJ)',
  cmrj: 'CMRJ-Familie (CMRJ, SL CMRJ)',
  dj: 'Drop-Jump-Familie (DJ, SL DJ)',
  hop: 'Hop-Familie (Hop, SL Hop, SL Hop and Return)',
  landing: 'Land-and-Hold-Familie (+SL)',
  isometric: 'Isometrie-Familie (generisch, IMTP, Isometric Squat, Shoulder ISO-I/Y/T)',
  balance: 'Balance-Familie (Quiet Stand, SL Stand, SL Range of Stability)',
};

const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Erzeugt docs/metrics.md aus der Registry (Single Source of Truth – ein Test prüft die Aktualität). */
export function renderMetricsDoc(): string {
  const metrics = allMetrics();
  const lines: string[] = [];
  lines.push('# Metriken');
  lines.push('');
  lines.push(
    '> **Diese Datei wird aus der Metrik-Registry erzeugt** (`pnpm docs:metrics`). Nicht von Hand ändern.',
  );
  lines.push('');
  lines.push('## Grundlagen und Konventionen');
  lines.push('');
  lines.push(
    '- `g = 9,80665 m/s²`. Nettokraft = Gesamtkraft − Körpergewicht(N); BW = (m_Körper + m_Last)·g aus dem Wiegen (Session-Masse).',
  );
  lines.push(
    '- Beschleunigung `a = (F − BW)/m`. Geschwindigkeit `v = ∫a dt`, Trapezregel, **je Rep neu ab Bewegungsbeginn** (`v(Onset) = 0`).',
  );
  lines.push(
    '  Weg `s = ∫v dt`, Netto-Impuls `J = ∫(F − BW) dt`. Verifiziert gegen die Referenz-Exporte (Fehler ≤ 5·10⁻⁶).',
  );
  lines.push(
    '- Bewegungsbeginn: Beginn des letzten **anhaltenden** (≥ 4 ms) Laufs mit `|F − BW| > 20 N` vor dem Abheben, Onset = Sample davor.',
  );
  lines.push(
    '- Abheben/Landung: Gesamtkraft unter/über 20 N, linear interpoliert (Sub-Sample). Flugphase 80 ms … 1,2 s.',
  );
  lines.push(
    '- Phasen (CMJ): **Entlastung** (Onset → v_min) · **Exzentrische Bremsung** (v_min → v = 0) · **Konzentrisch** (v = 0 → Takeoff) · **Flug** · **Landung**.',
  );
  lines.push('  Die Brems-RFD nutzt das Intervall minimale Kraft → v = 0.');
  lines.push(
    '- Standard-Sprunghöhe: Impuls-Momentum `h = v_TO²/(2g)`; zusätzlich Flugzeit `g·t²/8` und Imp-Dis.',
  );
  lines.push(
    '- **Asymmetrie** `(größere − kleinere Seite)/größere Seite · 100`, vorzeichenbehaftet: `+` = rechts höher, `−` = links höher.',
  );
  lines.push(
    '- Einheiten in der Datenbank immer metrisch (cm, s, m/s, N, N·s, W, N/s, %); die Anzeige rechnet konfigurierbar um.',
  );
  lines.push('');
  lines.push('## Testtypen und Familien');
  lines.push('');
  lines.push('| Typ | Familie | einbeinig | Last | Auto-Detect |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const t of TEST_TYPES) {
    const i = TEST_TYPE_INFO[t];
    lines.push(
      `| \`${t}\` – ${esc(i.label.de)} | ${i.family} | ${i.singleLeg ? 'ja' : ''} | ${i.loaded ? 'ja' : ''} | ${i.autoDetectable ? 'ja' : 'nein'} |`,
    );
  }
  lines.push('');
  const fams = Object.keys(FAMILY_TITLE) as TestFamily[];
  for (const fam of fams) {
    const ms = metrics.filter((m) => m.families.includes(fam));
    if (!ms.length) continue;
    lines.push(`## ${FAMILY_TITLE[fam]}`);
    lines.push('');
    lines.push('| Schlüssel | Bezeichnung | Einheit | Phase | Formel / Definition |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const m of ms) lines.push(row(m));
    lines.push('');
  }
  return lines.join('\n');
}

function row(m: MetricDefinition): string {
  return `| \`${m.key}\` | ${esc(m.label.de)} / ${esc(m.label.en)} | ${m.unit || '–'} | ${m.phase} | ${esc(m.description.de)} — \`${esc(m.formula)}\` |`;
}
