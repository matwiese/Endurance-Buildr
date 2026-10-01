import { useState, type FormEvent } from 'react';
import { Banner, Button, Card, Field } from '../components/ui.tsx';
import { useT } from '../i18n/hooks.ts';
import { useAuth, type AuthResult } from '../state/auth.ts';

/** Anmeldung bzw. Ersteinrichtung (wenn der Server noch keine Nutzer kennt). */
export function LoginPage() {
  const { t } = useT();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [org, setOrg] = useState('');
  const [name, setName] = useState('');
  const [result, setResult] = useState<AuthResult | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setResult(
        auth.setupRequired
          ? await auth.setup({ organization: org, name, email, password })
          : await auth.login(email, password),
      );
    } finally {
      setBusy(false);
    }
  };

  const message =
    result === 'invalid'
      ? t('auth.login.failed')
      : result === 'throttled'
        ? t('auth.login.throttled')
        : result === 'offline'
          ? t('auth.login.offline')
          : result === 'weak_password'
            ? t('auth.error.password_too_short')
            : result === 'error' || result === 'exists'
              ? t('auth.error.generic')
              : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pt-12" data-testid="login-page">
      <Card title={auth.setupRequired ? t('auth.setup.title') : t('auth.login.title')}>
        {auth.setupRequired && <p className="mb-3 text-muted">{t('auth.setup.intro')}</p>}
        {auth.offline && !result && <Banner tone="warn">{t('auth.login.offline')}</Banner>}
        {message && (
          <Banner tone="danger">
            <span data-testid="login-error">{message}</span>
          </Banner>
        )}
        <form onSubmit={(e) => void submit(e)}>
          {auth.setupRequired && (
            <>
              <Field label={t('auth.setup.org')} htmlFor="org">
                <input
                  id="org"
                  className="input"
                  required
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  data-testid="setup-org"
                />
              </Field>
              <Field label={t('auth.setup.name')} htmlFor="name">
                <input
                  id="name"
                  className="input"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="setup-name"
                />
              </Field>
            </>
          )}
          <Field label={t('auth.login.email')} htmlFor="email">
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email"
            />
          </Field>
          <Field
            label={t('auth.login.password')}
            htmlFor="password"
            hint={auth.setupRequired ? t('auth.setup.passwordHint') : undefined}
          >
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={auth.setupRequired ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="primary" size="lg" disabled={busy} data-testid="login-submit">
              {auth.setupRequired ? t('auth.setup.submit') : t('auth.login.submit')}
            </Button>
            {auth.offline && (
              <Button onClick={() => void auth.init()} data-testid="login-retry">
                {t('auth.login.retry')}
              </Button>
            )}
          </div>
        </form>
      </Card>
      <Card>
        <Button variant="ghost" onClick={() => auth.continueLocal()} data-testid="continue-local">
          {t('auth.login.local')}
        </Button>
        <p className="mt-1 text-xs text-muted">{t('auth.login.localHint')}</p>
      </Card>
    </div>
  );
}
