import type { GroupDTO, ProfileDTO, Sex } from '@buildr/shared';
import { CONSENT_VERSION, validateProfile } from '@buildr/shared';
import { useMemo, useState } from 'react';
import { useT } from '../i18n/hooks.ts';
import type { MessageKey } from '../i18n/index.ts';
import { isMinor } from '../lib/format.ts';
import { uid } from '../lib/uid.ts';
import { Banner, Button, Field, Toggle } from './ui.tsx';

export function emptyProfile(groupIds: string[]): ProfileDTO {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: '',
    dateOfBirth: null,
    sex: null,
    heightCm: null,
    weightKg: null,
    sport: null,
    email: null,
    notes: null,
    externalId: null,
    allowPhotoVideo: false,
    guardianConsent: false,
    healthConsentAt: null,
    groupIds,
    createdAt: now,
    updatedAt: now,
  };
}

/** Profilformular (Test-Workflow „Neuer Athlet“ und Hub-Verwaltung). Validierung identisch zum Server (@buildr/shared). */
export function ProfileForm({
  initial,
  groups,
  onSave,
  onCancel,
}: {
  initial: ProfileDTO;
  groups: GroupDTO[];
  onSave: (p: ProfileDTO) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [p, setP] = useState<ProfileDTO>(initial);
  const [submitted, setSubmitted] = useState(false);
  const issues = useMemo(() => validateProfile(p, new Date(), { requireHealthConsent: true }), [p]);
  const minor = isMinor(p.dateOfBirth);
  const set = <K extends keyof ProfileDTO>(k: K, v: ProfileDTO[K]) => setP((s) => ({ ...s, [k]: v }));
  const num = (v: string): number | null => (v === '' ? null : Number(v));
  const has = (field: string) => submitted && issues.some((i) => i.field === field);
  const err = (code: string) => t(`validation.${code}` as MessageKey);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (issues.length === 0) onSave({ ...p, name: p.name.trim(), updatedAt: new Date().toISOString() });
      }}
      noValidate
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label={t('profile.name')} htmlFor="p-name">
          <input
            id="p-name"
            className="input"
            value={p.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
            aria-invalid={has('name')}
            data-testid="profile-name"
          />
          {has('name') && <p className="mt-1 text-sm text-danger">{err('name_required')}</p>}
        </Field>
        <Field label={t('profile.dob')} htmlFor="p-dob">
          <input
            id="p-dob"
            className="input"
            type="date"
            value={p.dateOfBirth ?? ''}
            onChange={(e) => set('dateOfBirth', e.target.value || null)}
          />
          {has('dateOfBirth') && (
            <p className="mt-1 text-sm text-danger">
              {err(issues.find((i) => i.field === 'dateOfBirth')!.code)}
            </p>
          )}
        </Field>
        <Field label={t('profile.sex')} htmlFor="p-sex">
          <select
            id="p-sex"
            className="input"
            value={p.sex ?? ''}
            onChange={(e) => set('sex', (e.target.value || null) as Sex | null)}
          >
            <option value="" />
            <option value="f">{t('profile.sex.f')}</option>
            <option value="m">{t('profile.sex.m')}</option>
            <option value="d">{t('profile.sex.d')}</option>
          </select>
        </Field>
        <Field label={t('profile.sport')} htmlFor="p-sport">
          <input
            id="p-sport"
            className="input"
            value={p.sport ?? ''}
            onChange={(e) => set('sport', e.target.value || null)}
          />
        </Field>
        <Field label={t('profile.height')} htmlFor="p-h">
          <input
            id="p-h"
            className="input"
            type="number"
            value={p.heightCm ?? ''}
            onChange={(e) => set('heightCm', num(e.target.value))}
          />
          {has('heightCm') && <p className="mt-1 text-sm text-danger">{err('height_range')}</p>}
        </Field>
        <Field label={t('profile.weight')} htmlFor="p-w">
          <input
            id="p-w"
            className="input"
            type="number"
            step="0.1"
            value={p.weightKg ?? ''}
            onChange={(e) => set('weightKg', num(e.target.value))}
          />
          {has('weightKg') && <p className="mt-1 text-sm text-danger">{err('weight_range')}</p>}
        </Field>
        <Field label={t('profile.email')} htmlFor="p-mail">
          <input
            id="p-mail"
            className="input"
            type="email"
            value={p.email ?? ''}
            onChange={(e) => set('email', e.target.value || null)}
          />
          {has('email') && <p className="mt-1 text-sm text-danger">{err('email_invalid')}</p>}
        </Field>
        <Field label={t('profile.externalId')} htmlFor="p-ext">
          <input
            id="p-ext"
            className="input"
            value={p.externalId ?? ''}
            onChange={(e) => set('externalId', e.target.value || null)}
          />
        </Field>
      </div>
      <Field label={t('profile.notes')} htmlFor="p-notes">
        <textarea
          id="p-notes"
          className="input min-h-20"
          value={p.notes ?? ''}
          onChange={(e) => set('notes', e.target.value || null)}
        />
      </Field>

      <fieldset className="mb-3 rounded-xl border border-line p-3">
        <legend className="px-2 text-sm font-medium text-muted">{t('profile.groups')}</legend>
        {groups.map((g) => (
          <Toggle
            key={g.id}
            label={g.name}
            checked={p.groupIds.includes(g.id)}
            onChange={(v) =>
              set('groupIds', v ? [...p.groupIds, g.id] : p.groupIds.filter((x) => x !== g.id))
            }
          />
        ))}
        {has('groupIds') && <p className="text-sm text-danger">{t('profile.groups.required')}</p>}
      </fieldset>

      <fieldset className="mb-3 rounded-xl border border-line p-3">
        <legend className="px-2 text-sm font-medium text-muted">DSGVO</legend>
        <Toggle
          label={t('profile.consent.health')}
          checked={!!p.healthConsentAt}
          onChange={(v) =>
            setP((s) => ({
              ...s,
              healthConsentAt: v ? new Date().toISOString() : null,
              healthConsentVersion: v ? CONSENT_VERSION : null,
            }))
          }
        />
        {has('consent') && <p className="text-sm text-danger">{err('health_consent_required')}</p>}
        {minor && (
          <Toggle
            label={t('profile.guardianConsent')}
            checked={p.guardianConsent}
            onChange={(v) => set('guardianConsent', v)}
          />
        )}
        <Toggle
          label={t('profile.photoVideo')}
          checked={p.allowPhotoVideo}
          onChange={(v) => set('allowPhotoVideo', v)}
        />
        {minor && !p.guardianConsent && <Banner tone="warn">{t('profile.photoVideo.minorBlocked')}</Banner>}
        {has('allowPhotoVideo') && <p className="text-sm text-danger">{err('photo_video_minor')}</p>}
      </fieldset>

      <div className="flex justify-end gap-3">
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="primary" type="submit" data-testid="profile-save">
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
