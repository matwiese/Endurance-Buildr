import { describe, expect, it } from 'vitest';
import { ageOn, isMinorOn, validateProfile } from '../src/index.ts';

const today = new Date('2026-10-01T12:00:00Z');
const ok = {
  name: 'Anna',
  groupIds: ['g1'],
  dateOfBirth: '2000-05-17',
  heightCm: 170,
  weightKg: 65,
  email: 'a@b.at',
  allowPhotoVideo: false,
  guardianConsent: false,
  healthConsentAt: '2026-01-01T00:00:00Z',
};

describe('Profilvalidierung', () => {
  it('gültiges Profil ohne Befund', () => expect(validateProfile(ok, today)).toEqual([]));
  it('Name und Gruppe sind Pflicht', () => {
    const r = validateProfile({ ...ok, name: '  ', groupIds: [] }, today).map((i) => i.code);
    expect(r).toEqual(['name_required', 'group_required']);
  });
  it('Alter wird korrekt berechnet (Geburtstag heute / morgen)', () => {
    expect(ageOn('2008-10-01', today)).toBe(18);
    expect(ageOn('2008-10-02', today)).toBe(17);
    expect(isMinorOn('2008-10-02', today)).toBe(true);
    expect(isMinorOn('2008-10-01', today)).toBe(false);
    expect(ageOn('kaputt', today)).toBeNull();
  });
  it('Foto/Video unter 18 nur mit Einwilligung der Erziehungsberechtigten', () => {
    const minor = { ...ok, dateOfBirth: '2012-03-01', allowPhotoVideo: true };
    expect(validateProfile(minor, today).map((i) => i.code)).toContain('photo_video_minor');
    expect(validateProfile({ ...minor, guardianConsent: true }, today)).toEqual([]);
    expect(validateProfile({ ...ok, allowPhotoVideo: true }, today)).toEqual([]); // Erwachsene
  });
  it('Plausibilitätsgrenzen, E-Mail, Zukunftsdatum, Gesundheitsdaten-Einwilligung', () => {
    const codes = (o: object, opts = {}) => validateProfile({ ...ok, ...o }, today, opts).map((i) => i.code);
    expect(codes({ heightCm: 20 })).toEqual(['height_range']);
    expect(codes({ weightKg: 900 })).toEqual(['weight_range']);
    expect(codes({ email: 'x@y' })).toEqual(['email_invalid']);
    expect(codes({ dateOfBirth: '2030-01-01' })).toEqual(['dob_future']);
    expect(codes({ healthConsentAt: null }, { requireHealthConsent: true })).toEqual([
      'health_consent_required',
    ]);
    expect(codes({ healthConsentAt: null })).toEqual([]);
  });
});
