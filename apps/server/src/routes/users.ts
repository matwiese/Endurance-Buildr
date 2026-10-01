import { randomUUID } from 'node:crypto';
import { userCreateInput, userPatchInput } from '@buildr/shared';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { hashPassword, passwordIssue } from '../auth/password.ts';
import { destroyUserSessions } from '../auth/sessions.ts';
import { groups, userGroupAccess, users } from '../db/schema.ts';
import { HttpError, notFound, paramId, parse, requireCan } from '../http.ts';

export const userRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db, config } = ctx;

    const dto = (
      u: typeof users.$inferSelect,
      access: Array<{ groupId: string; access: 'read' | 'write' }>,
    ) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      groupScope: u.groupScope,
      active: u.active,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      access,
    });

    const checkGroups = async (orgId: string, ids: string[]) => {
      if (!ids.length) return;
      const rows = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.orgId, orgId), inArray(groups.id, ids)));
      if (rows.length !== new Set(ids).size) throw new HttpError(422, 'unknown_group');
    };

    api.get('/users', async (req) => {
      const p = requireCan(req, 'user.manage');
      const list = await db.select().from(users).where(eq(users.orgId, p.orgId)).orderBy(users.name);
      const acc = list.length
        ? await db
            .select()
            .from(userGroupAccess)
            .where(
              inArray(
                userGroupAccess.userId,
                list.map((u) => u.id),
              ),
            )
        : [];
      return list.map((u) =>
        dto(
          u,
          acc.filter((a) => a.userId === u.id).map((a) => ({ groupId: a.groupId, access: a.access })),
        ),
      );
    });

    api.post('/users', async (req, reply) => {
      const p = requireCan(req, 'user.manage');
      const input = parse(userCreateInput, req.body);
      const issue = passwordIssue(input.password);
      if (issue) throw new HttpError(422, `password_${issue}`);
      await checkGroups(
        p.orgId,
        input.access.map((a) => a.groupId),
      );
      const email = input.email.toLowerCase();
      const dup = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      if (dup.length) throw new HttpError(409, 'email_taken');
      const id = randomUUID();
      const passwordHash = await hashPassword(input.password, config.SCRYPT_LOG_N);
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          id,
          orgId: p.orgId,
          email,
          name: input.name,
          passwordHash,
          role: input.role,
          groupScope: input.groupScope,
        });
        if (input.groupScope === 'restricted' && input.access.length) {
          await tx
            .insert(userGroupAccess)
            .values(input.access.map((a) => ({ userId: id, groupId: a.groupId, access: a.access })));
        }
      });
      await audit(db, req, {
        orgId: p.orgId,
        action: 'user.create',
        entity: 'user',
        entityId: id,
        details: { role: input.role, groupScope: input.groupScope },
      });
      const [u] = await db.select().from(users).where(eq(users.id, id));
      return reply.status(201).send(dto(u!, input.groupScope === 'restricted' ? input.access : []));
    });

    api.patch('/users/:id', async (req) => {
      const p = requireCan(req, 'user.manage');
      const id = paramId(req);
      const patch = parse(userPatchInput, req.body);
      const [u] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.orgId, p.orgId)));
      if (!u) throw notFound();
      // Der letzte aktive Admin darf weder deaktiviert noch herabgestuft werden
      const losesAdmin =
        u.role === 'admin' && ((patch.role && patch.role !== 'admin') || patch.active === false);
      if (losesAdmin) {
        const others = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(eq(users.orgId, p.orgId), eq(users.role, 'admin'), eq(users.active, true), ne(users.id, id)),
          )
          .limit(1);
        if (!others.length) throw new HttpError(409, 'last_admin');
      }
      if (patch.access)
        await checkGroups(
          p.orgId,
          patch.access.map((a) => a.groupId),
        );
      const set: Partial<typeof users.$inferInsert> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.role !== undefined) set.role = patch.role;
      if (patch.active !== undefined) set.active = patch.active;
      if (patch.groupScope !== undefined) set.groupScope = patch.groupScope;
      if (patch.password !== undefined) {
        const issue = passwordIssue(patch.password);
        if (issue) throw new HttpError(422, `password_${issue}`);
        set.passwordHash = await hashPassword(patch.password, config.SCRYPT_LOG_N);
      }
      await db.transaction(async (tx) => {
        if (Object.keys(set).length) await tx.update(users).set(set).where(eq(users.id, id));
        if (patch.access) {
          await tx.delete(userGroupAccess).where(eq(userGroupAccess.userId, id));
          if (patch.access.length)
            await tx
              .insert(userGroupAccess)
              .values(patch.access.map((a) => ({ userId: id, groupId: a.groupId, access: a.access })));
        }
      });
      if (
        patch.active === false ||
        patch.password !== undefined ||
        patch.role !== undefined ||
        patch.groupScope !== undefined
      ) {
        await destroyUserSessions(db, id);
      }
      await audit(db, req, {
        orgId: p.orgId,
        action: 'user.update',
        entity: 'user',
        entityId: id,
        details: {
          fields: Object.keys(patch).filter((k) => k !== 'password'),
          passwordReset: patch.password !== undefined,
        },
      });
      const [fresh] = await db.select().from(users).where(eq(users.id, id));
      const acc = await db.select().from(userGroupAccess).where(eq(userGroupAccess.userId, id));
      return dto(
        fresh!,
        acc.map((a) => ({ groupId: a.groupId, access: a.access })),
      );
    });
  };
