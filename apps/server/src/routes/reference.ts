import { categoryInput, groupInput, tagInput, tagTypeInput } from '@buildr/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { allowedGroupIds } from '../auth/permissions.ts';
import type { Db } from '../db/client.ts';
import { categories, groups, tagTypes, tags, tombstones } from '../db/schema.ts';
import { HttpError, notFound, paramId, parse, requireAuth, requireCan } from '../http.ts';

export type RefEntity = 'category' | 'group' | 'tagType' | 'tag';

const REV = sql`nextval('sync_rev_seq')`;

export async function addTombstones(db: Db, orgId: string, entity: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db
    .insert(tombstones)
    .values(ids.map((entityId) => ({ orgId, entity, entityId })))
    .onConflictDoUpdate({ target: [tombstones.entity, tombstones.entityId], set: { rev: REV, orgId } });
}

export const referenceRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db } = ctx;

    api.get('/reference', async (req) => {
      const p = requireAuth(req);
      const allowed = allowedGroupIds(p, 'read');
      const [cats, grs, tts, tgs] = await Promise.all([
        db.select().from(categories).where(eq(categories.orgId, p.orgId)).orderBy(categories.name),
        db.select().from(groups).where(eq(groups.orgId, p.orgId)).orderBy(groups.name),
        db.select().from(tagTypes).where(eq(tagTypes.orgId, p.orgId)).orderBy(tagTypes.name),
        db.select().from(tags).where(eq(tags.orgId, p.orgId)).orderBy(tags.name),
      ]);
      return {
        categories: cats.map(({ id, name }) => ({ id, name })),
        groups: grs
          .filter((g) => !allowed || allowed.includes(g.id))
          .map(({ id, categoryId, name }) => ({ id, categoryId, name })),
        tagTypes: tts.map(({ id, name }) => ({ id, name })),
        tags: tgs.map(({ id, tagTypeId, name }) => ({ id, tagTypeId, name })),
      };
    });

    // ---- Kategorien ----
    api.put('/reference/categories/:id', async (req) => {
      const p = requireCan(req, 'reference.write');
      const id = paramId(req);
      const input = parse(categoryInput, req.body);
      if (input.id !== id) throw new HttpError(400, 'id_mismatch');
      const [ex] = await db.select({ orgId: categories.orgId }).from(categories).where(eq(categories.id, id));
      if (ex && ex.orgId !== p.orgId) throw notFound();
      await db
        .insert(categories)
        .values({ id, orgId: p.orgId, name: input.name })
        .onConflictDoUpdate({ target: categories.id, set: { name: input.name, rev: REV } });
      await audit(db, req, {
        orgId: p.orgId,
        action: ex ? 'category.update' : 'category.create',
        entity: 'category',
        entityId: id,
      });
      return { id, name: input.name };
    });

    api.delete('/reference/categories/:id', async (req, reply) => {
      const p = requireCan(req, 'reference.write');
      const id = paramId(req);
      const [ex] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.orgId, p.orgId)));
      if (!ex) throw notFound();
      await db.transaction(async (tx) => {
        const gs = await tx.select({ id: groups.id }).from(groups).where(eq(groups.categoryId, id));
        await addTombstones(
          tx,
          p.orgId,
          'group',
          gs.map((g) => g.id),
        );
        await addTombstones(tx, p.orgId, 'category', [id]);
        await tx.delete(categories).where(eq(categories.id, id));
      });
      await audit(db, req, { orgId: p.orgId, action: 'category.delete', entity: 'category', entityId: id });
      return reply.status(204).send();
    });

    // ---- Gruppen ----
    api.put('/reference/groups/:id', async (req) => {
      const p = requireCan(req, 'reference.write');
      const id = paramId(req);
      const input = parse(groupInput, req.body);
      if (input.id !== id) throw new HttpError(400, 'id_mismatch');
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, input.categoryId), eq(categories.orgId, p.orgId)));
      if (!cat) throw new HttpError(422, 'unknown_category');
      const [ex] = await db.select({ orgId: groups.orgId }).from(groups).where(eq(groups.id, id));
      if (ex && ex.orgId !== p.orgId) throw notFound();
      await db
        .insert(groups)
        .values({ id, orgId: p.orgId, categoryId: input.categoryId, name: input.name })
        .onConflictDoUpdate({
          target: groups.id,
          set: { name: input.name, categoryId: input.categoryId, rev: REV },
        });
      await audit(db, req, {
        orgId: p.orgId,
        action: ex ? 'group.update' : 'group.create',
        entity: 'group',
        entityId: id,
      });
      return { id, categoryId: input.categoryId, name: input.name };
    });

    api.delete('/reference/groups/:id', async (req, reply) => {
      const p = requireCan(req, 'reference.write');
      const id = paramId(req);
      const [ex] = await db
        .select()
        .from(groups)
        .where(and(eq(groups.id, id), eq(groups.orgId, p.orgId)));
      if (!ex) throw notFound();
      await db.transaction(async (tx) => {
        await addTombstones(tx, p.orgId, 'group', [id]);
        await tx.delete(groups).where(eq(groups.id, id));
      });
      await audit(db, req, { orgId: p.orgId, action: 'group.delete', entity: 'group', entityId: id });
      return reply.status(204).send();
    });

    // ---- Tag-Typen / Tags ----
    api.put('/reference/tag-types/:id', async (req) => {
      const p = requireCan(req, 'tag.write');
      const id = paramId(req);
      const input = parse(tagTypeInput, req.body);
      if (input.id !== id) throw new HttpError(400, 'id_mismatch');
      const [ex] = await db.select({ orgId: tagTypes.orgId }).from(tagTypes).where(eq(tagTypes.id, id));
      if (ex && ex.orgId !== p.orgId) throw notFound();
      await db
        .insert(tagTypes)
        .values({ id, orgId: p.orgId, name: input.name })
        .onConflictDoUpdate({ target: tagTypes.id, set: { name: input.name, rev: REV } });
      await audit(db, req, {
        orgId: p.orgId,
        action: ex ? 'tagType.update' : 'tagType.create',
        entity: 'tagType',
        entityId: id,
      });
      return { id, name: input.name };
    });

    api.delete('/reference/tag-types/:id', async (req, reply) => {
      const p = requireCan(req, 'reference.write');
      const id = paramId(req);
      const [ex] = await db
        .select()
        .from(tagTypes)
        .where(and(eq(tagTypes.id, id), eq(tagTypes.orgId, p.orgId)));
      if (!ex) throw notFound();
      await db.transaction(async (tx) => {
        const ts = await tx.select({ id: tags.id }).from(tags).where(eq(tags.tagTypeId, id));
        await addTombstones(
          tx,
          p.orgId,
          'tag',
          ts.map((t) => t.id),
        );
        await addTombstones(tx, p.orgId, 'tagType', [id]);
        await tx.delete(tagTypes).where(eq(tagTypes.id, id));
      });
      await audit(db, req, { orgId: p.orgId, action: 'tagType.delete', entity: 'tagType', entityId: id });
      return reply.status(204).send();
    });

    api.put('/reference/tags/:id', async (req) => {
      const p = requireCan(req, 'tag.write');
      const id = paramId(req);
      const input = parse(tagInput, req.body);
      if (input.id !== id) throw new HttpError(400, 'id_mismatch');
      const [tt] = await db
        .select({ id: tagTypes.id })
        .from(tagTypes)
        .where(and(eq(tagTypes.id, input.tagTypeId), eq(tagTypes.orgId, p.orgId)));
      if (!tt) throw new HttpError(422, 'unknown_tag_type');
      const [ex] = await db.select({ orgId: tags.orgId }).from(tags).where(eq(tags.id, id));
      if (ex && ex.orgId !== p.orgId) throw notFound();
      await db
        .insert(tags)
        .values({ id, orgId: p.orgId, tagTypeId: input.tagTypeId, name: input.name })
        .onConflictDoUpdate({
          target: tags.id,
          set: { name: input.name, tagTypeId: input.tagTypeId, rev: REV },
        });
      await audit(db, req, {
        orgId: p.orgId,
        action: ex ? 'tag.update' : 'tag.create',
        entity: 'tag',
        entityId: id,
      });
      return { id, tagTypeId: input.tagTypeId, name: input.name };
    });

    api.delete('/reference/tags/:id', async (req, reply) => {
      const p = requireCan(req, 'reference.write');
      const id = paramId(req);
      const [ex] = await db
        .select()
        .from(tags)
        .where(and(eq(tags.id, id), eq(tags.orgId, p.orgId)));
      if (!ex) throw notFound();
      await db.transaction(async (tx) => {
        await addTombstones(tx, p.orgId, 'tag', [id]);
        await tx.delete(tags).where(eq(tags.id, id));
      });
      await audit(db, req, { orgId: p.orgId, action: 'tag.delete', entity: 'tag', entityId: id });
      return reply.status(204).send();
    });
  };
