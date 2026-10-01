import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useMatch } from 'react-router-dom';
import { Banner, Button } from './components/ui.tsx';
import { useT } from './i18n/hooks.ts';
import type { MessageKey } from './i18n/index.ts';
import { localRepo } from './offline/repo.ts';
import { LoginPage } from './pages/LoginPage.tsx';
import { TestWorkflow } from './pages/test/TestWorkflow.tsx';
import { canTest, useAuth } from './state/auth.ts';
import { useSettings } from './state/settings.ts';
import { syncEngine, useSyncState } from './sync/index.ts';

// Hub, Gruppentest, Beamer und Einstellungen werden erst beim Aufruf geladen (kleinerer Start der Aufnahme-Ansicht)
const HubHome = lazy(() => import('./pages/hub/HubHome.tsx').then((m) => ({ default: m.HubHome })));
const BeamerBoard = lazy(() => import('./session/BeamerBoard.tsx').then((m) => ({ default: m.BeamerBoard })));
const SessionRunner = lazy(() =>
  import('./session/SessionRunner.tsx').then((m) => ({ default: m.SessionRunner })),
);
const SessionsPage = lazy(() =>
  import('./session/SessionsPage.tsx').then((m) => ({ default: m.SessionsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })),
);

const HUB_SECTIONS: Record<string, MessageKey> = {
  athletes: 'nav.profiles',
  tests: 'nav.tests',
  reports: 'nav.reports',
  norms: 'nav.norms',
  groups: 'nav.groups',
  tags: 'nav.tags',
  admin: 'nav.admin',
};

/** Seitenname der aktuellen Route (für Dokumenttitel und die Hauptüberschrift, die in der Oberfläche unsichtbar bleibt). */
function usePageName(): { name: string; hasOwnHeading: boolean } {
  const { t } = useT();
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  const area = parts[0] ?? 'test';
  if (area === 'hub') {
    const section = HUB_SECTIONS[parts[1] ?? 'athletes'];
    return { name: `${t('nav.hub')} · ${t(section ?? 'nav.profiles')}`, hasOwnHeading: false };
  }
  if (area === 'session') return { name: t('nav.session'), hasOwnHeading: parts.length > 1 };
  if (area === 'settings') return { name: t('nav.settings'), hasOwnHeading: true };
  return { name: t('nav.test'), hasOwnHeading: false };
}

/** Dokumenttitel je Seite (WCAG 2.4.2) und – wo die Seite keine eigene h1 hat – eine unsichtbare Hauptüberschrift. */
function PageHeading({ authenticated }: { authenticated: boolean }) {
  const { t } = useT();
  const { name, hasOwnHeading } = usePageName();
  const title = authenticated ? `${name} · ${t('app.name')}` : t('app.name');
  useEffect(() => {
    document.title = title;
  }, [title]);
  if (hasOwnHeading) return null;
  return <h1 className="sr-only">{authenticated ? name : t('app.name')}</h1>;
}

function SyncBadge() {
  const { t } = useT();
  const sync = useSyncState();
  const auth = useAuth();
  if (auth.status !== 'authenticated') return null;
  const label = sync.running
    ? t('sync.running')
    : sync.failed
      ? t('sync.failed', { n: sync.failed })
      : sync.pending
        ? t('sync.pending', { n: sync.pending })
        : sync.offline
          ? t('status.offline')
          : t('sync.upToDate');
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={sync.failed ? 'text-danger' : sync.offline || sync.pending ? 'text-warn' : 'text-muted'}
        data-testid="sync-badge"
        title={
          sync.lastSyncAt
            ? `${t('sync.last')}: ${new Date(sync.lastSyncAt).toLocaleTimeString()}`
            : `${t('sync.last')}: ${t('sync.never')}`
        }
      >
        {label}
      </span>
      <button
        className="btn btn-sm"
        onClick={() => void (sync.failed ? syncEngine.retryFailed() : syncEngine.run())}
        data-testid="sync-now"
      >
        {sync.failed ? t('sync.retry') : t('sync.now')}
      </button>
    </div>
  );
}

function Header() {
  const { t } = useT();
  const s = useSettings();
  const auth = useAuth();
  const canRun = useAuth(canTest);
  const link = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center rounded-lg px-4 py-2 font-semibold ${isActive ? 'bg-primary text-primary-fg' : 'hover:bg-surface2'}`;

  const logout = async () => {
    const open = (await localRepo.outbox.count()) > 0;
    if (open && !window.confirm(t('auth.logout.confirm', { n: await localRepo.outbox.count() }))) return;
    await auth.logout();
  };
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2">
      <img src="/icon.svg" alt="" className="h-9 w-9" />
      <div className="mr-4 leading-tight">
        <div className="text-lg font-extrabold">{t('app.name')}</div>
        <div className="text-xs text-muted">{t('app.tagline')}</div>
      </div>
      <nav className="flex gap-1" aria-label="Navigation">
        <NavLink to="/test" className={link} data-testid="nav-test">
          {t('nav.test')}
        </NavLink>
        {canRun && (
          <NavLink to="/session" className={link} data-testid="nav-session">
            {t('nav.session')}
          </NavLink>
        )}
        <NavLink to="/hub" className={link} data-testid="nav-hub">
          {t('nav.hub')}
        </NavLink>
        <NavLink to="/settings" className={link}>
          {t('nav.settings')}
        </NavLink>
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <SyncBadge />
        {auth.status === 'authenticated' && auth.me && (
          <span className="chip" data-testid="user-chip" title={auth.me.email}>
            {auth.me.name} · {t(`auth.role.${auth.me.role}` as 'auth.role.admin')}
          </span>
        )}
        {auth.status === 'local' && (
          <span className="chip" data-testid="local-chip">
            {t('auth.local')}
          </span>
        )}
        {(auth.status === 'authenticated' || auth.status === 'local') && (
          <Button
            size="sm"
            onClick={() => void (auth.status === 'local' ? auth.leaveLocal() : logout())}
            data-testid="logout"
          >
            {auth.status === 'local' ? t('auth.login.title') : t('nav.logout')}
          </Button>
        )}
        <button
          className="btn btn-sm"
          onClick={() => s.set({ lang: s.lang === 'de' ? 'en' : 'de' })}
          aria-label="Language"
          data-testid="lang-toggle"
        >
          {s.lang === 'de' ? 'DE' : 'EN'}
        </button>
        <button
          className="btn btn-sm"
          onClick={() => s.set({ theme: s.theme === 'dark' ? 'light' : 'dark' })}
          aria-label="Theme"
        >
          {s.theme === 'dark' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}

/** Startet den Abgleich, solange eine Serversitzung besteht; bei abgelaufener Sitzung zurück zur Anmeldung. */
function SyncRunner() {
  const status = useAuth((s) => s.status);
  const sessionLost = useAuth((s) => s.sessionLost);
  const authRequired = useSyncState().authRequired;
  useEffect(() => {
    if (status !== 'authenticated') return;
    return syncEngine.start();
  }, [status]);
  useEffect(() => {
    if (authRequired && status === 'authenticated') sessionLost();
  }, [authRequired, status, sessionLost]);
  return null;
}

/** Seiten, die Tests aufnehmen (Einzeltest, Gruppentest): Betrachter sehen nur einen Hinweis. */
function RecorderRoute({ children }: { children: ReactNode }) {
  const { t } = useT();
  const allowed = useAuth(canTest);
  if (!allowed)
    return (
      <div className="p-4">
        <Banner tone="warn">{t('auth.viewerNoTest')}</Banner>
      </div>
    );
  return <>{children}</>;
}

// Simulator-Tempo (Demo/Tests): ?speed=5 beschleunigt den Autopiloten – einmal beim Start gelesen (bleibt bei Navigation erhalten)
const SPEED = Number(new URLSearchParams(window.location.search).get('speed') ?? 1) || 1;

export function App() {
  const { t } = useT();
  const lang = useSettings((s) => s.lang);
  const theme = useSettings((s) => s.theme);
  const status = useAuth((s) => s.status);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#0f2f2d' : '#f4f1ea');
  }, [lang, theme]);
  useEffect(() => {
    if (started) return;
    setStarted(true);
    void useAuth.getState().init();
  }, [started]);
  const boardView = useMatch('/session/:id/board');
  return (
    <div className="flex min-h-full flex-col" data-auth={status}>
      <a href="#main" className="skip-link">
        {t('a11y.skip')}
      </a>
      {!boardView && <Header />}
      <SyncRunner />
      <main id="main" className="flex-1" tabIndex={-1}>
        <PageHeading authenticated={status === 'authenticated' || status === 'local'} />
        {status === 'loading' ? (
          <div className="p-8 text-center text-muted" role="status">
            …
          </div>
        ) : status === 'anonymous' ? (
          <LoginPage />
        ) : (
          <Suspense
            fallback={
              <div className="p-8 text-center text-muted" role="status">
                …
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to="/test" replace />} />
              <Route
                path="/test"
                element={
                  <RecorderRoute>
                    <TestWorkflow simSpeed={SPEED} />
                  </RecorderRoute>
                }
              />
              <Route
                path="/session"
                element={
                  <RecorderRoute>
                    <SessionsPage />
                  </RecorderRoute>
                }
              />
              <Route
                path="/session/:id"
                element={
                  <RecorderRoute>
                    <SessionRunner simSpeed={SPEED} />
                  </RecorderRoute>
                }
              />
              <Route path="/session/:id/board" element={<BeamerBoard />} />
              <Route path="/hub/*" element={<HubHome />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/test" replace />} />
            </Routes>
          </Suspense>
        )}
      </main>
    </div>
  );
}
