/**
 * Zentrale Analyse-Konfiguration. ALLE Schwellen stehen hier (bzw. in classifier-rules.ts) – nicht verstreut im Code.
 * Werte sind an den Referenzdaten (/reference) kalibriert; siehe ASSUMPTIONS.md.
 */
export interface AnalysisConfig {
  zero: {
    /** Fensterlänge für die Offset-Mittelung */
    windowMs: number;
    /** max. SD je Platte im Fenster */
    sdMaxN: number;
    /** max. |Mittelwert| je Platte (sonst steht etwas auf der Platte) */
    maxEmptyLoadN: number;
    /** Abbruch, wenn nach dieser Zeit kein stabiles Fenster gefunden wurde */
    maxWaitMs: number;
  };
  weigh: {
    windowMs: number;
    sdN: number;
    sdRel: number;
    /** max. Mittelwertdifferenz zwischen älterer und jüngerer Fensterhälfte (Rampe ≠ stabil) */
    driftN: number;
    driftRel: number;
    /** unter dieser Gesamtkraft gilt „niemand auf den Platten“ */
    minBodyForceN: number;
    /** zur Massenbestimmung gemittelte Stabil-Dauer (max.) */
    maxAveragingMs: number;
  };
  quiet: {
    /** Standard-Fensterlänge (Spezifikation: 1 s) */
    windowMs: number;
    /** Fenster für Block-Ende/Segmentierung */
    settleMs: number;
    /** Rückfall-Fenster, wenn vor der Bewegung kein volles Fenster ruhig war (kurze Vorlaufzeit, z. B. Referenz-Crops) */
    fallbackWindowsMs: number[];
    sdN: number;
    sdRel: number;
    meanTolN: number;
    meanTolRel: number;
  };
  onset: {
    /** 'threshold' = |F−BW| > thresholdN (Referenz-Verhalten) · 'sd5' = Ruhemittel ± sdK·SD */
    method: 'threshold' | 'sd5';
    thresholdN: number;
    /** anhaltende Abweichung (Samples = round(ms·hz/1000), min. 2) */
    sustainMs: number;
    /** kurze Durchgänge durch das BW-Band (z. B. beim Nulldurchgang der Nettokraft) werden zum Lauf verschmolzen */
    mergeGapMs: number;
    sdK: number;
    /** Untergrenze der SD-basierten Schwelle (N) */
    sdMinThresholdN: number;
  };
  isoOnset: {
    method: 'yank' | 'sd5';
    /** Yank-Schwellen (N/s) in Abhängigkeit vom Netto-Peak */
    yankLowNs: number;
    yankHighNs: number;
    peakSplitN: number;
    smoothMs: number;
    sustainMs: number;
    sdK: number;
    /** Mindest-Kontraktion über Ruhe (N), darunter keine Rep */
    minContractionN: number;
  };
  flight: {
    thresholdN: number;
    minFlightMs: number;
    maxFlightMs: number;
    minContactMs: number;
    /** vor dem Abheben muss innerhalb preTakeoffWindowMs mind. dieser Anteil BW erreicht worden sein (Abtreten ≠ Sprung) */
    preTakeoffMinBw: number;
    preTakeoffWindowMs: number;
  };
  kinematics: {
    /** 'session' = Masse aus dem Wiegen (Referenz) · 'local' = Ruhemittelwert vor der Rep */
    bwSource: 'session' | 'local';
    /** zulässige Abweichung Ruhe-Mittel ↔ Session-Gewicht, sonst Warnung `weight_mismatch` */
    weightMismatchRel: number;
    /**
     * Abhebegeschwindigkeit am Zeitpunkt F = 0 statt an der 20-N-Kante (Korrektur ≈ g·20 N/Kraftabfall ≈ 1 cm/s ⇒ −0,3 cm).
     * false = identisch zur Referenz-App (Wert an der Schwelle).
     */
    takeoffCorrection: boolean;
  };
  phases: {
    /** Gegenbewegung vorhanden, wenn v_min kleiner ODER Tiefe größer */
    cmMinVelocity: number;
    cmMinDepthM: number;
  };
  landing: {
    windowMs: number;
    stabilizationTolRel: number;
    stabilizationHoldMs: number;
  };
  rfd: { windowMs: number };
  hop: { bestN: number; bestMetric: string };
  detect: {
    /** Anteil der Kontaktlast auf einer Platte → einbeinig */
    singleLegShare: number;
    /** Mindest-Aufprall (×BW) im Fenster nach erstem Kontakt für „Drop-Landung“ */
    dropImpactMinBw: number;
    dropImpactWindowMs: number;
    /** Kontakt zwischen zwei Flügen länger als dies ⇒ getrennte Blöcke (Reps); kürzer ⇒ eine Sequenz (CMRJ/Hops) */
    blockGapMs: number;
    /** unter dieser Konfidenz → „unklar“, die Person entscheidet */
    minConfidence: number;
  };
  balance: {
    trimStartMs: number;
    ellipseChi2: number;
  };
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  zero: { windowMs: 1000, sdMaxN: 3, maxEmptyLoadN: 100, maxWaitMs: 5000 },
  weigh: {
    windowMs: 1000,
    sdN: 6,
    sdRel: 0.01,
    driftN: 6,
    driftRel: 0.006,
    minBodyForceN: 100,
    maxAveragingMs: 3000,
  },
  quiet: {
    windowMs: 1000,
    settleMs: 500,
    fallbackWindowsMs: [500, 300],
    // Einbeinstand schwankt bis ~2 % BW (SD) – nur zur Trennung von Bewegungsblöcken, Wiegen ist strenger (weigh.sdRel)
    sdN: 6,
    sdRel: 0.025,
    meanTolN: 25,
    meanTolRel: 0.03,
  },
  onset: { method: 'threshold', thresholdN: 20, sustainMs: 4, mergeGapMs: 20, sdK: 5, sdMinThresholdN: 5 },
  isoOnset: {
    method: 'yank',
    yankLowNs: 40,
    yankHighNs: 350,
    peakSplitN: 250,
    smoothMs: 50,
    sustainMs: 30,
    sdK: 5,
    minContractionN: 30,
  },
  flight: {
    thresholdN: 20,
    minFlightMs: 80,
    maxFlightMs: 1200,
    minContactMs: 15,
    preTakeoffMinBw: 0.5,
    preTakeoffWindowMs: 50,
  },
  kinematics: { bwSource: 'session', weightMismatchRel: 0.15, takeoffCorrection: true },
  phases: { cmMinVelocity: -0.2, cmMinDepthM: 0.03 },
  landing: { windowMs: 500, stabilizationTolRel: 0.05, stabilizationHoldMs: 500 },
  rfd: { windowMs: 50 },
  hop: { bestN: 5, bestMetric: 'rsi' },
  detect: {
    singleLegShare: 0.9,
    dropImpactMinBw: 1.8,
    dropImpactWindowMs: 100,
    blockGapMs: 800,
    minConfidence: 0.55,
  },
  balance: { trimStartMs: 1000, ellipseChi2: 5.991 },
};

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends (infer U)[] ? U[] : DeepPartial<T[K]> };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function mergeConfig(partial?: DeepPartial<AnalysisConfig>): AnalysisConfig {
  return deepMerge(DEFAULT_ANALYSIS_CONFIG, partial ?? {});
}
