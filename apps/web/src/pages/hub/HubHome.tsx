import { Card } from '../../components/ui.tsx';
import { useT } from '../../i18n/hooks.ts';

/** Hub (Desktop): Verwaltung und Reports – wird in den Meilensteinen M6–M8 ausgebaut. */
export function HubHome() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-5xl p-4">
      <Card title={t('nav.hub')}>
        <p className="text-muted">
          {t('nav.profiles')} · {t('nav.sessions')} · {t('nav.tests')} · {t('nav.reports')} · {t('nav.norms')}
        </p>
      </Card>
    </div>
  );
}
