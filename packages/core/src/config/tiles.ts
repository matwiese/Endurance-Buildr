import { ISO_PRESETS } from './iso-presets.ts';
import { TEST_TYPES, TEST_TYPE_INFO, type TestFamily, type TestType } from '../testTypes.ts';

/**
 * Standard-Kacheln der Sofortergebnisse je Testtyp (Metrik-Schlüssel). In den Einstellungen pro Typ überschreibbar.
 * Jeweils inkl. Links/Rechts-Asymmetrie (in % mit Seitenangabe, siehe formatMetricValue).
 */
const FAMILY_TILES: Record<Exclude<TestFamily, 'isometric'>, string[]> = {
  cmj: [
    'jump_height_impmom',
    'jump_height_flight',
    'rsi_modified',
    'concentric_peak_force',
    'peak_power_rel',
    'countermovement_depth',
    'contraction_time',
    'asym_takeoff_peak_force',
  ],
  sj: [
    'jump_height_impmom',
    'jump_height_flight',
    'concentric_peak_force',
    'peak_power_rel',
    'concentric_impulse_rel',
    'asym_concentric_impulse',
  ],
  cmrj: [
    'jump_height_impmom',
    'rebound_jump_height',
    'rebound_rsi',
    'rebound_contact_time',
    'concentric_peak_force',
    'asym_takeoff_peak_force',
  ],
  dj: [
    'jump_height_flight',
    'contact_time',
    'rsi',
    'active_stiffness',
    'peak_drop_landing_force',
    'asym_contact_peak_force',
  ],
  hop: [
    'rsi',
    'jump_height_flight',
    'contact_time',
    'flight_time',
    'contact_peak_force',
    'asym_contact_peak_force',
  ],
  landing: [
    'peak_landing_force',
    'landing_rfd',
    'time_to_stabilization',
    'drop_height_est',
    'asym_landing_mean_force',
  ],
  balance: [
    'cop_path_length',
    'cop_area_95',
    'cop_mean_velocity',
    'cop_ap_sd',
    'cop_ml_sd',
    'asym_balance_load',
  ],
};

export const DEFAULT_TILE_METRICS: Record<TestType, string[]> = Object.fromEntries(
  TEST_TYPES.map((t) => {
    const fam = TEST_TYPE_INFO[t].family;
    if (fam === 'isometric') return [t, [...(ISO_PRESETS[t]?.tiles ?? ISO_PRESETS.isometric.tiles)]];
    return [t, [...FAMILY_TILES[fam]]];
  }),
) as Record<TestType, string[]>;
