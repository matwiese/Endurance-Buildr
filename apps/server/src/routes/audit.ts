import { and, desc, eq, lt } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { auditLog } from '../db/schema.ts';
import { parse, requireCan } from '../http.ts';

const query = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  before: z.coerce.number().int().optional(),
});

export const auditRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    api.get('/audit', async (req) => {
      const p = requireCan(req, 'audit.read');
      const q = parse(query, req.query);
      const rows = await ctx.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.orgId, p.orgId), q.before ? lt(auditLog.id, q.before) : undefined))
        .orderBy(desc(auditLog.id))
        .limit(q.limit);
      return rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        user: r.userEmail,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        ip: r.ip,
        details: r.details,
      }));
    });
  };
