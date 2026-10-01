import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useT } from './i18n/hooks.ts';
import { HubHome } from './pages/hub/HubHome.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TestWorkflow } from './pages/test/TestWorkflow.tsx';
import { useSettings } from './state/settings.ts';

function Header() {
  const { t } = useT();
  const s = useSettings();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-4 py-2 font-semibold ${isActive ? 'bg-primary text-primary-fg' : 'hover:bg-surface2'}`;
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
        <NavLink to="/hub" className={link} data-testid="nav-hub">
          {t('nav.hub')}
        </NavLink>
        <NavLink to="/settings" className={link}>
          {t('nav.settings')}
        </NavLink>
      </nav>
      <div className="ml-auto flex items-center gap-2">
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

export function App() {
  const lang = useSettings((s) => s.lang);
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'dark' ? '#0f2f2d' : '#f4f1ea');
  }, [lang, theme]);
  // Simulator-Tempo (Demo/Tests): ?speed=5 beschleunigt den Autopiloten
  const speed = Number(new URLSearchParams(window.location.search).get('speed') ?? 1) || 1;
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/test" replace />} />
          <Route path="/test" element={<TestWorkflow simSpeed={speed} />} />
          <Route path="/hub/*" element={<HubHome />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/test" replace />} />
        </Routes>
      </div>
    </div>
  );
}
