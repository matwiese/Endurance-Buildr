import type { Role } from '@buildr/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, NetworkError, api } from '../../api/client.ts';
import { Banner, Button, Card, Chip, Field, Modal, ScrollArea } from '../../components/ui.tsx';
import { useRefData } from '../../hub/hooks.ts';
import { useT } from '../../i18n/hooks.ts';
import type { MessageKey } from '../../i18n/index.ts';
import { formatDateTime } from '../../lib/format.ts';
import { useAuth } from '../../state/auth.ts';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  groupScope: 'all' | 'restricted';
  active: boolean;
  lastLoginAt: string | null;
  access: Array<{ groupId: string; access: 'read' | 'write' }>;
}

interface AuditRow {
  id: number;
  at: string;
  user: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
}

type Access = 'none' | 'read' | 'write';

function UserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const { groups } = useRefData();
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'tester');
  const [scope, setScope] = useState<'all' | 'restricted'>(user?.groupScope ?? 'all');
  const [active, setActive] = useState(user?.active ?? true);
  const [access, setAccess] = useState<Record<string, Access>>(
    Object.fromEntries((user?.access ?? []).map((a) => [a.groupId, a.access])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const acc = Object.entries(access)
      .filter(([, a]) => a !== 'none')
      .map(([groupId, a]) => ({ groupId, access: a as 'read' | 'write' }));
    try {
      if (user) {
        await api.patch(`/api/users/${user.id}`, {
          name,
          role,
          active,
          groupScope: scope,
          access: scope === 'restricted' ? acc : [],
          ...(password ? { password } : {}),
        });
      } else {
        await api.post('/api/users', {
          email,
          name,
          password,
          role,
          groupScope: scope,
          access: scope === 'restricted' ? acc : [],
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof NetworkError) setError(t('common.error.offline'));
      else if (err instanceof ApiError) {
        const key = `admin.error.${err.code}` as MessageKey;
        setError(
          err.code === 'password_too_short'
            ? t('auth.error.password_too_short')
            : t(key) !== key
              ? t(key)
              : t('admin.error.generic'),
        );
      } else setError(t('admin.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={user ? t('admin.user.edit') : t('admin.user.new')} onClose={onClose} wide>
      <form onSubmit={(e) => void submit(e)}>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label={t('admin.user.email')} htmlFor="u-email">
            <input
              id="u-email"
              className="input"
              type="email"
              required
              disabled={!!user}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="user-email"
            />
          </Field>
          <Field label={t('admin.user.name')} htmlFor="u-name">
            <input
              id="u-name"
              className="input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="user-name"
            />
          </Field>
          <Field label={user ? t('admin.user.resetPw') : t('admin.user.password')} htmlFor="u-pw">
            <input
              id="u-pw"
              className="input"
              type="password"
              autoComplete="new-password"
              required={!user}
              minLength={user && !password ? undefined : 10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="user-password"
            />
          </Field>
          <Field label={t('admin.user.role')} htmlFor="u-role">
            <select
              id="u-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              data-testid="user-role"
            >
              {(['admin', 'tester', 'viewer'] as const).map((r) => (
                <option key={r} value={r}>
                  {t(`auth.role.${r}` as MessageKey)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('admin.user.scope')} htmlFor="u-scope">
            <select
              id="u-scope"
              className="input"
              value={scope}
              onChange={(e) => setScope(e.target.value as 'all' | 'restricted')}
              data-testid="user-scope"
            >
              <option value="all">{t('admin.scope.all')}</option>
              <option value="restricted">{t('admin.scope.restricted')}</option>
            </select>
          </Field>
          {user && (
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="h-6 w-6"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              {t('admin.user.active')}
            </label>
          )}
        </div>
        {scope === 'restricted' && (
          <fieldset className="mb-3 rounded-xl border border-line p-3">
            <legend className="px-2 text-sm font-medium text-muted">{t('admin.user.access')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {groups.map((g) => (
                <label key={g.id} className="flex items-center justify-between gap-3">
                  <span>{g.name}</span>
                  <select
                    className="input min-h-10 w-44"
                    value={access[g.id] ?? 'none'}
                    onChange={(e) => setAccess((a) => ({ ...a, [g.id]: e.target.value as Access }))}
                    data-testid={`access-${g.name}`}
                  >
                    <option value="none">{t('admin.access.none')}</option>
                    <option value="read">{t('admin.access.read')}</option>
                    <option value="write">{t('admin.access.write')}</option>
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex justify-end gap-3">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy} data-testid="user-save">
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Nutzerverwaltung und Audit-Log (nur Administratoren, nur mit Serververbindung). */
export function AdminPage() {
  const { t, lang } = useT();
  const status = useAuth((s) => s.status);
  const me = useAuth((s) => s.me);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moreAudit, setMoreAudit] = useState(true);
  const allowed = status === 'authenticated' && me?.role === 'admin';

  const load = useCallback(async () => {
    try {
      setUsers(await api.get<UserRow[]>('/api/users'));
      const a = await api.get<AuditRow[]>('/api/audit?limit=50');
      setAudit(a);
      setMoreAudit(a.length === 50);
      setError(null);
    } catch (e) {
      setError(e instanceof NetworkError ? t('common.error.offline') : t('common.error.forbidden'));
    }
  }, [t]);
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) return <Banner tone="warn">{t('admin.needsServer')}</Banner>;

  const loadMore = async () => {
    const last = audit[audit.length - 1];
    if (!last) return;
    const a = await api.get<AuditRow[]>(`/api/audit?limit=50&before=${last.id}`);
    setAudit((cur) => [...cur, ...a]);
    setMoreAudit(a.length === 50);
  };

  return (
    <div className="grid gap-4">
      {error && <Banner tone="danger">{error}</Banner>}
      <Card
        title={t('admin.users')}
        actions={
          <Button size="sm" variant="primary" onClick={() => setEditing('new')} data-testid="user-new">
            + {t('admin.user.new')}
          </Button>
        }
      >
        <ScrollArea className="overflow-x-auto">
          <table className="table-base" data-testid="users-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.user.name')}</th>
                <th scope="col">{t('admin.user.email')}</th>
                <th scope="col">{t('admin.user.role')}</th>
                <th scope="col">{t('admin.user.scope')}</th>
                <th scope="col">{t('admin.user.lastLogin')}</th>
                <th scope="col">
                  <span className="sr-only">{t('common.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'opacity-50'} data-testid={`user-row-${u.email}`}>
                  <td className="font-semibold">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <Chip tone={u.role === 'admin' ? 'primary' : 'default'}>
                      {t(`auth.role.${u.role}` as MessageKey)}
                    </Chip>
                  </td>
                  <td>{u.groupScope === 'all' ? t('admin.scope.all') : t('admin.scope.restricted')}</td>
                  <td className="text-sm">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt, lang) : t('admin.user.never')}
                  </td>
                  <td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(u)}
                      data-testid={`user-edit-${u.email}`}
                    >
                      {t('common.edit')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </Card>

      <Card title={t('admin.audit')}>
        <p className="mb-2 text-xs text-muted">{t('admin.audit.hint')}</p>
        <ScrollArea className="max-h-96 overflow-auto rounded-xl border border-line">
          <table className="table-base" data-testid="audit-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.audit.time')}</th>
                <th scope="col">{t('admin.audit.user')}</th>
                <th scope="col">{t('admin.audit.action')}</th>
                <th scope="col">{t('admin.audit.entity')}</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-sm">{formatDateTime(a.at, lang)}</td>
                  <td className="text-sm">{a.user ?? '–'}</td>
                  <td className="font-mono text-sm">{a.action}</td>
                  <td className="text-sm text-muted">
                    {a.entity ? `${a.entity} ${a.entityId?.slice(0, 8) ?? ''}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
        {moreAudit && (
          <Button size="sm" className="mt-3" onClick={() => void loadMore()}>
            {t('admin.audit.more')}
          </Button>
        )}
      </Card>

      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
