import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { useRole } from '../../state/auth.ts';
import { AdminPage } from './AdminPage.tsx';
import { NormsPage } from './NormsPage.tsx';
import { ProfilePage } from './ProfilePage.tsx';
import { ReportsPage } from './ReportsPage.tsx';
import { TestDetailPage } from './TestDetailPage.tsx';
import { TestsPage } from './TestsPage.tsx';
import { GroupsPage } from './GroupsPage.tsx';
import { ProfilesPage } from './ProfilesPage.tsx';
import { TagsPage } from './TagsPage.tsx';

interface NavItem {
  to: string;
  label: MessageKey;
  adminOnly?: boolean;
}

const ITEMS: NavItem[] = [
  { to: 'athletes', label: 'nav.profiles' },
  { to: 'tests', label: 'nav.tests' },
  { to: 'reports', label: 'nav.reports' },
  { to: 'norms', label: 'nav.norms' },
  { to: 'groups', label: 'nav.groups' },
  { to: 'tags', label: 'nav.tags' },
  { to: 'admin', label: 'nav.admin', adminOnly: true },
];

function Shell() {
  const { t } = useT();
  const role = useRole();
  return (
    <div className="mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[210px_1fr]" data-testid="hub">
      <nav aria-label={t('nav.hub')} className="flex gap-1 lg:flex-col">
        {ITEMS.filter((i) => !i.adminOnly || role === 'admin').map((i) => (
          <NavLink
            key={i.to}
            to={`/hub/${i.to}`}
            data-testid={`hub-nav-${i.to}`}
            className={({ isActive }) =>
              `rounded-xl px-4 py-3 font-semibold ${isActive ? 'bg-primary text-primary-fg' : 'hover:bg-surface2'}`
            }
          >
            {t(i.label)}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

/** Hub: Verwaltung (Athleten, Gruppen, Tags, Nutzer) – Sessions/Tests/Reports/Normwerte folgen in M7/M8. */
export function HubHome() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/hub/athletes" replace />} />
        <Route path="athletes" element={<ProfilesPage />} />
        <Route path="athletes/:id" element={<ProfilePage />} />
        <Route path="tests" element={<TestsPage />} />
        <Route path="tests/:id" element={<TestDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="norms" element={<NormsPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/hub/athletes" replace />} />
      </Route>
    </Routes>
  );
}
