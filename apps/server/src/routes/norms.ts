import { normSetInput, type NormRow, type NormSetDTO } from '@buildr/shared';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { metricDefinitions, normRows, normSets } from '../db/schema.ts';
import { HttpError, notFound, paramId, parse, requireAuth, requireCan } from '../http.ts';

const rowDto = (r: typeof normRows.$inferSelect): NormRow => ({
  testType: r.testType as NormRow['testType'],
  metric: r.metric,
  sex: r.sex,
  ageMin: r.ageMin,
  ageMax: r.ageMax,
  sport: r.sport,
  n: r.n,
  mean: r.mean,
  sd: r.sd,
  pct: r.pct,
});

/** Eigene Normsets (Referenzdaten) der Organisation – es werden keine Normdaten mitgeliefert. */
export const normRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db } = ctx;

    api.get('/norms', async (req) => {
      const p = requireAuth(req);
      const sets = await db.select().from(normSets).where(eq(normSets.orgId, p.orgId)).orderBy(normSets.name);
      const counts = sets.length
        ? await db
            .select({ setId: normRows.setId, n: count() })
            .from(normRows)
            .where(
              inArray(
                normRows.setId,
                sets.map((s) => s.id),
              ),
            )
            .groupBy(normRows.setId)
        : [];
      return sets.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        rowCount: counts.find((c) => c.setId === s.id)?.n ?? 0,
      }));
    });

    api.get('/norms/:id', async (req): Promise<NormSetDTO> => {
      const p = requireAuth(req);
      const [s] = await db
        .select()
        .from(normSets)
        .where(and(eq(normSets.id, paramId(req)), eq(normSets.orgId, p.orgId)));
      if (!s) throw notFound();
      const rows = await db.select().from(normRows).where(eq(normRows.setId, s.id)).orderBy(normRows.id);
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        rows: rows.map(rowDto),
      };
    });

    /** Normset anlegen/ersetzen (Zeilen werden komplett ersetzt). */
    api.put('/norms/:id', async (req, reply) => {
      const p = requireCan(req, 'norms.write');
      const id = paramId(req);
      const input = parse(normSetInput, req.body);
      if (input.id !== id) throw new HttpError(400, 'id_mismatch');
      const known = new Set(
        (await db.select({ k: metricDefinitions.key }).from(metricDefinitions)).map((m) => m.k),
      );
      const unknown = [...new Set(input.rows.map((r) => r.metric))].filter((m) => !known.has(m));
      if (unknown.length)
        throw new HttpError(422, 'unknown_metric', 'Unknown metric', { metrics: unknown.slice(0, 20) });
      const bad = input.rows.findIndex((r) => r.ageMin !== null && r.ageMax !== null && r.ageMin > r.ageMax);
      if (bad >= 0) throw new HttpError(422, 'age_range', 'ageMin > ageMax', { row: bad });
      const [ex] = await db.select().from(normSets).where(eq(normSets.id, id));
      if (ex && ex.orgId !== p.orgId) throw notFound();
      await db.transaction(async (tx) => {
        await tx
          .insert(normSets)
          .values({ id, orgId: p.orgId, name: input.name, description: input.description, createdBy: p.id })
          .onConflictDoUpdate({
            target: normSets.id,
            set: { name: input.name, description: input.description, updatedAt: new Date() },
          });
        await tx.delete(normRows).where(eq(normRows.setId, id));
        for (let i = 0; i < input.rows.length; i += 2000) {
          await tx.insert(normRows).values(input.rows.slice(i, i + 2000).map((r) => ({ setId: id, ...r })));
        }
      });
      await audit(db, req, {
        orgId: p.orgId,
        action: ex ? 'norms.update' : 'norms.create',
        entity: 'norms',
        entityId: id,
        details: { rows: input.rows.length },
      });
      return reply.status(ex ? 200 : 201).send({ id, rowCount: input.rows.length });
    });

    api.delete('/norms/:id', async (req, reply) => {
      const p = requireCan(req, 'norms.write');
      const id = paramId(req);
      const [s] = await db
        .select()
        .from(normSets)
        .where(and(eq(normSets.id, id), eq(normSets.orgId, p.orgId)));
      if (!s) throw notFound();
      await db.delete(normSets).where(eq(normSets.id, id));
      await audit(db, req, { orgId: p.orgId, action: 'norms.delete', entity: 'norms', entityId: id });
      return reply.status(204).send();
    });
  };
