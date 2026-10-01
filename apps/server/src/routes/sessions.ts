import { sessionInput, type SessionDTO } from '@buildr/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { can, canAccessGroups, type Principal } from '../auth/permissions.ts';
import { groups, profileGroups, profiles, sessions } from '../db/schema.ts';
import { HttpError, notFound, paramId, parse, requireCan } from '../http.ts';

type Row = typeof sessions.$inferSelect;

const dto = (r: Row): SessionDTO => ({
  id: r.id,
  name: r.name,
  mode: r.mode as SessionDTO['mode'],
  externalLoadKg: r.externalLoadKg,
  groupId: r.groupId,
  status: r.status,
  queue: r.queue,
  board: r.board,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
});

/** Eingeschränkte Nutzer sehen/ändern nur eigene Sitzungen. */
const visible = (p: Principal, r: Row): boolean =>
  r.orgId === p.orgId && (p.groupScope === 'all' || r.createdBy === p.id);

const listQuery = z.object({
  status: z.enum(['active', 'paused', 'finished']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const sessionRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db } = ctx;

    api.get('/sessions', async (req) => {
      const p = requireCan(req, 'test.read');
      const q = parse(listQuery, req.query);
      const rows = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.orgId, p.orgId), q.status ? eq(sessions.status, q.status) : undefined))
        .orderBy(desc(sessions.createdAt))
        .limit(q.limit);
      return rows.filter((r) => visible(p, r)).map(dto);
    });

    api.get('/sessions/:id', async (req) => {
      const p = requireCan(req, 'test.read');
      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.id, paramId(req)));
      if (!row || !visible(p, row)) throw notFound();
      return dto(row);
    });

    /** Idempotentes Anlegen/Ändern (Client-UUID); bei Konflikt gewinnt der neuere `updatedAt`. */
    api.put('/sessions/:id', async (req, reply) => {
      const p = requireCan(req, 'test.write');
      const id = paramId(req);
      const input = parse(sessionInput, req.body);
      if (input.id !== id) throw new HttpError(400, 'id_mismatch');

      const [ex] = await db.select().from(sessions).where(eq(sessions.id, id));
      if (ex && !visible(p, ex)) throw notFound();

      const ids = [...new Set(input.queue.map((q) => q.profileId))];
      if (ids.length) {
        const owned = await db
          .select({ id: profiles.id })
          .from(profiles)
          .where(and(eq(profiles.orgId, p.orgId), inArray(profiles.id, ids)));
        if (owned.length !== ids.length) throw new HttpError(422, 'unknown_profile');
        if (p.groupScope === 'restricted') {
          const links = await db.select().from(profileGroups).where(inArray(profileGroups.profileId, ids));
          for (const pid of ids) {
            const gs = links.filter((l) => l.profileId === pid).map((l) => l.groupId);
            if (!canAccessGroups(p, gs, 'write')) throw new HttpError(403, 'profile_forbidden');
          }
        }
      }
      if (input.groupId) {
        const [g] = await db
          .select({ id: groups.id })
          .from(groups)
          .where(and(eq(groups.id, input.groupId), eq(groups.orgId, p.orgId)));
        if (!g) throw new HttpError(422, 'unknown_group');
      }

      const updatedAt = new Date(input.updatedAt);
      if (ex && ex.updatedAt.getTime() > updatedAt.getTime())
        return reply.send({ session: dto(ex), applied: false });

      const values = {
        orgId: p.orgId,
        name: input.name,
        mode: input.mode,
        externalLoadKg: input.externalLoadKg,
        groupId: input.groupId,
        status: input.status,
        queue: input.queue,
        board: input.board,
        updatedAt,
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : null,
      };
      await db
        .insert(sessions)
        .values({ id, ...values, createdBy: p.id, createdAt: new Date(input.createdAt) })
        .onConflictDoUpdate({ target: sessions.id, set: values });
      // nur Statuswechsel protokollieren (kein Rauschen bei jeder Queue-Änderung)
      if (!ex || ex.status !== input.status) {
        await audit(db, req, {
          orgId: p.orgId,
          action: ex ? `session.${input.status}` : 'session.create',
          entity: 'session',
          entityId: id,
          details: { athletes: input.queue.length },
        });
      }
      const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
      return reply.status(ex ? 200 : 201).send({ session: dto(row!), applied: true });
    });

    api.delete('/sessions/:id', async (req, reply) => {
      const p = requireCan(req, 'test.write');
      const id = paramId(req);
      const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
      if (!row || !visible(p, row)) throw notFound();
      if (!can(p, 'test.delete') && row.createdBy !== p.id) throw new HttpError(403, 'forbidden');
      // Tests bleiben erhalten (session_id → null durch Fremdschlüssel)
      await db.delete(sessions).where(eq(sessions.id, id));
      await audit(db, req, { orgId: p.orgId, action: 'session.delete', entity: 'session', entityId: id });
      return reply.status(204).send();
    });
  };
