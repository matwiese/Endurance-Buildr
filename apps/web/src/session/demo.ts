import { CONSENT_VERSION, type GroupDTO, type ProfileDTO } from '@buildr/shared';
import { uid } from '../lib/uid.ts';

const NAMES = [
  'Lena Auer',
  'Noah Bauer',
  'Mia Gruber',
  'Elias Hofer',
  'Sofia Leitner',
  'Jonas Mayer',
  'Hannah Pichler',
  'Luca Steiner',
  'Emma Wagner',
  'Felix Zeller',
];

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Deterministische Eigenschaften des simulierten Athleten (Masse aus dem Profil, Sprungvermögen/Asymmetrie aus der ID). */
export function simAthleteFor(p: Pick<ProfileDTO, 'id' | 'weightKg'>): {
  bodyMass: number;
  asymmetry: number;
  abilityM: number;
} {
  const h = hash(p.id);
  return {
    bodyMass: p.weightKg && p.weightKg > 30 ? p.weightKg : 75,
    asymmetry: (((h >>> 8) % 17) - 8) / 100, // −8 … +8 % (Anteil R − L)
    abilityM: 0.22 + ((h >>> 16) % 27) / 100, // 22 … 48 cm
  };
}

/** 10 Beispiel-Athleten (kein Realbezug) für Demo-Sessions mit dem Simulator. */
export function demoProfiles(group: GroupDTO, now = new Date().toISOString()): ProfileDTO[] {
  return NAMES.map((name, i) => ({
    id: uid(),
    name,
    dateOfBirth: `${2000 + (i % 8)}-0${1 + (i % 9)}-1${i % 9}`,
    sex: i % 2 === 0 ? 'f' : 'm',
    heightCm: 165 + i * 2,
    weightKg: 56 + i * 5,
    sport: 'Demo',
    email: null,
    notes: null,
    externalId: null,
    allowPhotoVideo: false,
    guardianConsent: false,
    healthConsentAt: now,
    healthConsentVersion: CONSENT_VERSION,
    groupIds: [group.id],
    createdAt: now,
    updatedAt: now,
  }));
}
