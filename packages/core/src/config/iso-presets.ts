import type { TestType } from '../testTypes.ts';

/**
 * Isometrie-Presets: steuern Kacheln, Hinweise und Schwellen – nicht die Mathematik (die ist für alle gleich).
 * Wiegen ist bei Isometrics optional und soll in der Testposition erfolgen.
 */
export interface IsoPreset {
  /** Mindest-Auslenkung (N) über der Basislinie, damit eine Kontraktion zählt */
  minContractionN: number;
  /** empfohlene Aufnahmedauer (s) */
  defaultDurationS: number;
  /** Wiegen: 'recommended' (IMTP/Squat: Netto-Peak braucht BW in Testposition) | 'optional' */
  weigh: 'recommended' | 'optional';
  /** Kennzahl-Kacheln (Metrik-Schlüssel) */
  tiles: string[];
  hint: { de: string; en: string };
}

const BASE_TILES = [
  'iso_peak_force',
  'iso_net_peak_force',
  'iso_time_to_peak',
  'iso_rfd_200',
  'asym_iso_peak_force',
];

export const ISO_PRESETS: Partial<Record<TestType, IsoPreset>> & { isometric: IsoPreset } = {
  isometric: {
    minContractionN: 30,
    defaultDurationS: 6,
    weigh: 'optional',
    tiles: BASE_TILES,
    hint: {
      de: 'Position einnehmen, Kraft ruhig aufbauen, ≥ 3 s halten.',
      en: 'Take position, build force smoothly, hold ≥ 3 s.',
    },
  },
  imtp: {
    minContractionN: 50,
    defaultDurationS: 6,
    weigh: 'recommended',
    tiles: [
      'iso_peak_force',
      'iso_net_peak_force',
      'iso_rfd_100',
      'iso_rfd_200',
      'iso_impulse_200ms',
      'asym_iso_peak_force',
    ],
    hint: {
      de: 'Stange in Mittel-Oberschenkel-Position vorspannen (Wiegen in Testposition), dann maximal und schnell ziehen.',
      en: 'Pre-tension the bar in the mid-thigh position (weigh in test position), then pull as hard and fast as possible.',
    },
  },
  iso_squat: {
    minContractionN: 50,
    defaultDurationS: 6,
    weigh: 'recommended',
    tiles: ['iso_peak_force', 'iso_net_peak_force', 'iso_rfd_100', 'iso_time_to_peak', 'asym_iso_peak_force'],
    hint: {
      de: 'Fixierte Stange, Kniewinkel einstellen, maximal nach oben drücken.',
      en: 'Fixed bar, set knee angle, push up maximally.',
    },
  },
  shoulder_iso_i: {
    minContractionN: 10,
    defaultDurationS: 5,
    weigh: 'optional',
    tiles: ['iso_peak_force', 'iso_time_to_peak', 'iso_rfd_100', 'asym_iso_peak_force'],
    hint: {
      de: 'Schulter-ISO „I“: Arme überkopf, gleichmäßig drücken.',
      en: 'Shoulder ISO-I: arms overhead, press evenly.',
    },
  },
  shoulder_iso_y: {
    minContractionN: 10,
    defaultDurationS: 5,
    weigh: 'optional',
    tiles: ['iso_peak_force', 'iso_time_to_peak', 'iso_rfd_100', 'asym_iso_peak_force'],
    hint: { de: 'Schulter-ISO „Y“: Arme in Y-Position.', en: 'Shoulder ISO-Y: arms in Y position.' },
  },
  shoulder_iso_t: {
    minContractionN: 10,
    defaultDurationS: 5,
    weigh: 'optional',
    tiles: ['iso_peak_force', 'iso_time_to_peak', 'iso_rfd_100', 'asym_iso_peak_force'],
    hint: {
      de: 'Schulter-ISO „T“: Arme seitlich in T-Position.',
      en: 'Shoulder ISO-T: arms out to the side.',
    },
  },
};

export const isoPresetFor = (type: TestType): IsoPreset => ISO_PRESETS[type] ?? ISO_PRESETS.isometric;
