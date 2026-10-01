import type { Classification } from '../detect/classify.ts';
import type { TestType } from '../testTypes.ts';
import type { AnalysisWarning } from '../types.ts';

export interface RepResult {
  /** laufende Nummer in der Aufnahme */
  index: number;
  blockIndex: number;
  /** wirksamer Typ ('unclear' = vom Nutzer zu bestimmen) */
  type: TestType | 'unclear';
  /** vom Auto-Detect erkannter Typ; null bei fest vorgegebenem Typ */
  detectedType: TestType | 'unclear' | null;
  confidence: number | null;
  candidates?: Classification['candidates'];
  /** Sample-Bereich [startIdx, endIdx) einschließlich Vorlauf (zum Zeichnen/Neuanalysieren) */
  startIdx: number;
  endIdx: number;
  /** benannte Ereignisse (gebrochene Sample-Indizes): onset, zeroVel, takeoff, landing, … */
  events: Record<string, number>;
  /** Registry-Metriken (metrische Einheiten) */
  metrics: Record<string, number | null>;
  side: 'left' | 'right' | 'both';
  warnings: AnalysisWarning[];
  /** in Auswertung/Zusammenfassung eingeschlossen */
  included: boolean;
  /** Hop: erster Kontakt aus dem Stand (nicht repräsentativ) */
  leadIn?: boolean;
  /** Hop: laufende Nummer innerhalb der Serie (1…) */
  hopIndex?: number;
}

export interface RecordingAnalysis {
  hz: number;
  bodyMassKg: number | null;
  massSource: 'session' | 'quiet' | 'none';
  externalLoadKg: number;
  reps: RepResult[];
  warnings: AnalysisWarning[];
}
