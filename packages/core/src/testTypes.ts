export const TEST_TYPES = [
  'cmj',
  'loaded_cmj',
  'abalakov',
  'sj',
  'loaded_sj',
  'cmrj',
  'dj',
  'hop',
  'sl_jump',
  'sl_cmrj',
  'sl_dj',
  'sl_hop',
  'sl_hop_return',
  'land_hold',
  'sl_land_hold',
  'isometric',
  'imtp',
  'iso_squat',
  'shoulder_iso_i',
  'shoulder_iso_y',
  'shoulder_iso_t',
  'quiet_stand',
  'sl_stand',
  'sl_range_of_stability',
] as const;

export type TestType = (typeof TEST_TYPES)[number];

/** Metrik-/Analysefamilie: bestimmt, welche Metriken berechnet werden. */
export type TestFamily = 'cmj' | 'sj' | 'cmrj' | 'dj' | 'hop' | 'landing' | 'isometric' | 'balance';

export interface TestTypeInfo {
  family: TestFamily;
  singleLeg: boolean;
  loaded: boolean;
  /** vom Auto-Detect erkennbar */
  autoDetectable: boolean;
  /** Gewicht ist Pflicht (Auto Detect: immer) */
  label: { de: string; en: string };
}

const t = (
  family: TestFamily,
  de: string,
  en: string,
  o: Partial<Pick<TestTypeInfo, 'singleLeg' | 'loaded' | 'autoDetectable'>> = {},
): TestTypeInfo => ({
  family,
  singleLeg: o.singleLeg ?? false,
  loaded: o.loaded ?? false,
  autoDetectable: o.autoDetectable ?? true,
  label: { de, en },
});

export const TEST_TYPE_INFO: Record<TestType, TestTypeInfo> = {
  cmj: t('cmj', 'Gegenbewegungssprung (CMJ)', 'Countermovement Jump (CMJ)'),
  loaded_cmj: t('cmj', 'CMJ mit Zusatzlast', 'Loaded CMJ', { loaded: true }),
  abalakov: t('cmj', 'Abalakov-Sprung', 'Abalakov Jump', { autoDetectable: false }),
  sj: t('sj', 'Squat Jump (SJ)', 'Squat Jump (SJ)'),
  loaded_sj: t('sj', 'SJ mit Zusatzlast', 'Loaded SJ', { loaded: true }),
  cmrj: t('cmrj', 'CMJ-Rebound-Sprung (CMRJ)', 'CMJ Rebound Jump (CMRJ)'),
  dj: t('dj', 'Drop Jump (DJ)', 'Drop Jump (DJ)'),
  hop: t('hop', 'Hop-Test', 'Hop Test'),
  sl_jump: t('cmj', 'Einbeiniger Sprung', 'Single Leg Jump', { singleLeg: true }),
  sl_cmrj: t('cmrj', 'Einbeiniger CMRJ', 'SL CMRJ', { singleLeg: true }),
  sl_dj: t('dj', 'Einbeiniger Drop Jump', 'SL DJ', { singleLeg: true }),
  sl_hop: t('hop', 'Einbeiniger Hop-Test', 'SL Hop Test', { singleLeg: true }),
  sl_hop_return: t('hop', 'Einbeiniger Hop und Zurück', 'Single Leg Hop and Return', { singleLeg: true }),
  land_hold: t('landing', 'Landen und Halten', 'Land and Hold'),
  sl_land_hold: t('landing', 'Einbeiniges Landen und Halten', 'SL Land and Hold', { singleLeg: true }),
  isometric: t('isometric', 'Isometrie (generisch)', 'Isometric (generic)', { autoDetectable: false }),
  imtp: t('isometric', 'Isometric Mid-Thigh Pull (IMTP)', 'Isometric Mid-Thigh Pull (IMTP)', {
    autoDetectable: false,
  }),
  iso_squat: t('isometric', 'Isometrische Kniebeuge', 'Isometric Squat', { autoDetectable: false }),
  shoulder_iso_i: t('isometric', 'Schulter-ISO „I“', 'Shoulder ISO-I', { autoDetectable: false }),
  shoulder_iso_y: t('isometric', 'Schulter-ISO „Y“', 'Shoulder ISO-Y', { autoDetectable: false }),
  shoulder_iso_t: t('isometric', 'Schulter-ISO „T“', 'Shoulder ISO-T', { autoDetectable: false }),
  quiet_stand: t('balance', 'Ruhiger Stand', 'Quiet Stand', { autoDetectable: false }),
  sl_stand: t('balance', 'Einbeiniger Stand', 'Single Leg Stand', { singleLeg: true, autoDetectable: false }),
  sl_range_of_stability: t('balance', 'Einbeiniger Stabilitätsbereich', 'SL Range of Stability', {
    singleLeg: true,
    autoDetectable: false,
  }),
};

export const isTestType = (v: unknown): v is TestType =>
  typeof v === 'string' && (TEST_TYPES as readonly string[]).includes(v);

export const familyOf = (type: TestType): TestFamily => TEST_TYPE_INFO[type].family;

/** Typen, bei denen die Aufnahme als Kontakt-/Flug-Sequenz analysiert wird (Sprünge/Landungen). */
export const isJumpFamily = (f: TestFamily): boolean => f !== 'isometric' && f !== 'balance';

/** Balance-Tests dürfen mit 200 Hz laufen. */
export const ALLOWED_SAMPLING_HZ = [200, 500, 1000] as const;
export const minHzFor = (type: TestType): number => (TEST_TYPE_INFO[type].family === 'balance' ? 200 : 500);
