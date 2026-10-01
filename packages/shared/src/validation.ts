import type { ProfileDTO } from './model.ts';

export type ProfileIssueCode =
  | 'name_required'
  | 'group_required'
  | 'dob_invalid'
  | 'dob_future'
  | 'height_range'
  | 'weight_range'
  | 'email_invalid'
  | 'photo_video_minor'
  | 'health_consent_required';

export interface ProfileIssue {
  field: keyof ProfileDTO | 'consent';
  code: ProfileIssueCode;
}

export function ageOn(dob: string | null | undefined, today: Date): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let a = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

export const isMinorOn = (dob: string | null | undefined, today: Date): boolean => {
  const a = ageOn(dob, today);
  return a !== null && a < 18;
};

/**
 * Profil-Regeln (Client UND Server): Name Pflicht · mindestens eine Gruppe · plausible Maße · Foto/Video unter 18 nur mit
 * Einwilligung der Erziehungsberechtigten · Einwilligung zur Verarbeitung von Gesundheitsdaten (Art. 9 DSGVO) vor Tests.
 */
export function validateProfile(
  p: Pick<
    ProfileDTO,
    | 'name'
    | 'groupIds'
    | 'dateOfBirth'
    | 'heightCm'
    | 'weightKg'
    | 'email'
    | 'allowPhotoVideo'
    | 'guardianConsent'
    | 'healthConsentAt'
  >,
  today: Date = new Date(),
  opts: { requireHealthConsent?: boolean } = {},
): ProfileIssue[] {
  const out: ProfileIssue[] = [];
  if (!p.name || !p.name.trim()) out.push({ field: 'name', code: 'name_required' });
  if (!p.groupIds || p.groupIds.length === 0) out.push({ field: 'groupIds', code: 'group_required' });
  if (p.dateOfBirth) {
    const age = ageOn(p.dateOfBirth, today);
    if (age === null) out.push({ field: 'dateOfBirth', code: 'dob_invalid' });
    else if (age < 0) out.push({ field: 'dateOfBirth', code: 'dob_future' });
  }
  if (p.heightCm !== null && p.heightCm !== undefined && (p.heightCm < 50 || p.heightCm > 260))
    out.push({ field: 'heightCm', code: 'height_range' });
  if (p.weightKg !== null && p.weightKg !== undefined && (p.weightKg < 10 || p.weightKg > 400))
    out.push({ field: 'weightKg', code: 'weight_range' });
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
    out.push({ field: 'email', code: 'email_invalid' });
  if (p.allowPhotoVideo && isMinorOn(p.dateOfBirth, today) && !p.guardianConsent)
    out.push({ field: 'allowPhotoVideo', code: 'photo_video_minor' });
  if (opts.requireHealthConsent && !p.healthConsentAt)
    out.push({ field: 'consent', code: 'health_consent_required' });
  return out;
}
