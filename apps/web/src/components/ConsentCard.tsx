import { CONSENT_VERSION, type ProfileDTO } from '@buildr/shared';
import { useState } from 'react';
import { saveProfile } from '../hub/services.ts';
import { useT } from '../i18n/hooks.ts';
import { Banner, Button, Card, Toggle } from './ui.tsx';

/**
 * Sperre vor dem Test: fehlt die Einwilligung zur Verarbeitung von Gesundheitsdaten (Art. 9 DSGVO), wird sie hier mit
 * Zeitpunkt und Fassung des Einwilligungstextes erfasst. Erst danach kann gewogen/aufgenommen werden.
 */
export function ConsentCard({
  profile,
  onGranted,
}: {
  profile: ProfileDTO;
  onGranted: (p: ProfileDTO) => void;
}) {
  const { t } = useT();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Card title="DSGVO" className="border-warn">
      <Banner tone="warn">
        <span data-testid="consent-missing">{t('consent.missing', { name: profile.name })}</span>
      </Banner>
      <Toggle label={t('profile.consent.health')} checked={checked} onChange={setChecked} />
      <p className="mb-3 text-xs text-muted">{t('consent.hint', { version: CONSENT_VERSION })}</p>
      <Button
        variant="primary"
        disabled={!checked || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const next: ProfileDTO = {
              ...profile,
              healthConsentAt: new Date().toISOString(),
              healthConsentVersion: CONSENT_VERSION,
            };
            await saveProfile(next);
            onGranted(next);
          } finally {
            setBusy(false);
          }
        }}
        data-testid="consent-grant"
      >
        {t('consent.grant')}
      </Button>
    </Card>
  );
}
