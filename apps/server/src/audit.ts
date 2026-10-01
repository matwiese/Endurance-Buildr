import type { FastifyRequest } from 'fastify';
import type { Db } from './db/client.ts';
import { auditLog } from './db/schema.ts';

export interface AuditEntry {
  orgId: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  /** nur Metadaten – niemals Messwerte oder Gesundheitsdaten */
  details?: Record<string, unknown>;
}

export async function audit(db: Db, req: FastifyRequest | null, e: AuditEntry): Promise<void> {
  const p = req?.principal;
  await db.insert(auditLog).values({
    orgId: e.orgId,
    userId: e.userId ?? p?.id ?? null,
    userEmail: e.userEmail ?? p?.email ?? null,
    action: e.action,
    entity: e.entity ?? null,
    entityId: e.entityId ?? null,
    ip: req?.ip ?? null,
    details: e.details ?? null,
  });
}
