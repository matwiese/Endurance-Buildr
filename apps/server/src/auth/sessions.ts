import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { authSessions, userGroupAccess, users } from '../db/schema.ts';
import type { Principal } from './permissions.ts';

export const COOKIE_NAME = 'bf_session';

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export async function createSession(
  db: Db,
  userId: string,
  ttlDays: number,
  userAgent: string | undefined,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  await db
    .insert(authSessions)
    .values({ id: hashToken(token), userId, expiresAt, userAgent: userAgent?.slice(0, 300) });
  return { token, expiresAt };
}

export async function destroySession(db: Db, token: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.id, hashToken(token)));
}

export async function destroyUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

/** Prinzipal zum Cookie-Token (null bei unbekannt/abgelaufen/deaktiviert). Gleitende Verlängerung wird nicht verwendet. */
export async function principalFromToken(db: Db, token: string | undefined): Promise<Principal | null> {
  if (!token) return null;
  const rows = await db
    .select({ u: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, hashToken(token)), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0]?.u;
  if (!u || !u.active) return null;
  const access = new Map<string, 'read' | 'write'>();
  if (u.groupScope === 'restricted') {
    for (const a of await db.select().from(userGroupAccess).where(eq(userGroupAccess.userId, u.id)))
      access.set(a.groupId, a.access);
  }
  return {
    id: u.id,
    orgId: u.orgId,
    email: u.email,
    name: u.name,
    role: u.role,
    groupScope: u.groupScope,
    access,
  };
}
