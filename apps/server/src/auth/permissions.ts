import type { Role } from '@buildr/shared';

/**
 * Zentrale Rechteprüfung. Rollen: admin (alles) · tester (Tests aufnehmen, Profile bearbeiten) · viewer (nur lesen).
 * Gruppen-Scoping: Nutzer mit `groupScope = restricted` sehen/bearbeiten nur Profile in ihnen zugewiesenen Gruppen.
 */
export type Action =
  | 'profile.read'
  | 'profile.write'
  | 'profile.delete'
  | 'test.read'
  | 'test.write'
  | 'test.delete'
  | 'reference.write'
  | 'tag.write'
  | 'user.manage'
  | 'audit.read'
  | 'norms.write'
  | 'export';

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  admin: new Set<Action>([
    'profile.read',
    'profile.write',
    'profile.delete',
    'test.read',
    'test.write',
    'test.delete',
    'reference.write',
    'tag.write',
    'user.manage',
    'audit.read',
    'norms.write',
    'export',
  ]),
  tester: new Set<Action>([
    'profile.read',
    'profile.write',
    'test.read',
    'test.write',
    'tag.write',
    'export',
  ]),
  viewer: new Set<Action>(['profile.read', 'test.read', 'export']),
};

export interface Principal {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  groupScope: 'all' | 'restricted';
  /** Zuweisungen (nur relevant bei `restricted`) */
  access: ReadonlyMap<string, 'read' | 'write'>;
}

export const can = (p: Pick<Principal, 'role'>, action: Action): boolean => MATRIX[p.role].has(action);

/**
 * Darf der Nutzer auf ein Profil mit diesen Gruppen zugreifen?
 * `read`: Mitglied einer erlaubten Gruppe (mind. read); `write`: Mitglied einer Gruppe mit write.
 * Rollenrechte (z. B. viewer darf nie schreiben) werden separat über `can` geprüft.
 */
export function canAccessGroups(p: Principal, groupIds: readonly string[], mode: 'read' | 'write'): boolean {
  if (p.groupScope === 'all') return true;
  return groupIds.some((g) => {
    const a = p.access.get(g);
    return a === 'write' || (a === 'read' && mode === 'read');
  });
}

/** Gruppen-IDs, auf die der Nutzer zugreifen darf (`null` = alle). */
export function allowedGroupIds(p: Principal, mode: 'read' | 'write'): string[] | null {
  if (p.groupScope === 'all') return null;
  return [...p.access].filter(([, a]) => a === 'write' || mode === 'read').map(([g]) => g);
}
