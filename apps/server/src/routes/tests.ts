import { createHash } from 'node:crypto';
import { testInput, testPatchInput, type RepRecord, type TestRecord } from '@buildr/shared';
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { allowedGroupIds, canAccessGroups, type Principal } from '../auth/permissions.ts';
import type { Db } from '../db/client.ts';
import {
  metricDefinitions,
  profileGroups,
  recordings,
  repMetrics,
  reps,
  tags,
  testTags,
  tests,
} from '../db/schema.ts';
import { HttpError, notFound, paramId, parse, requireCan } from '../http.ts';
import { assertProfileAccess, groupIdsOfProfile } from './profiles.ts';

/** Deterministische Serialisierung (sortierte Schlüssel) für den Inhalts-Hash. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

type TestRow = typeof tests.$inferSelect;

/** SQL-Bedingung: Tests, die der Nutzer lesen darf. */
function scopeCondition(p: Principal): SQL {
  const allowed = allowedGroupIds(p, 'read');
  if (!allowed) return sql`true`;
  const inList = allowed.length
    ? sql.join(
        allowed.map((g) => sql`${g}`),
        sql`, `,
      )
    : sql`null`;
  return sql`(${tests.profileId} is null and ${tests.createdBy} = ${p.id}
    or exists (select 1 from ${profileGroups} pg where pg.profile_id = ${tests.profileId} and pg.group_id in (${inList})))`;
}

export async function loadTests(
  db: Db,
  p: Principal,
  opts: { where?: SQL[]; limit?: number; offset?: number; withReps?: boolean } = {},
): Promise<TestRecord[]> {
  const conds: SQL[] = [eq(tests.orgId, p.orgId), scopeCondition(p), ...(opts.where ?? [])];
  let q = db
    .select()
    .from(tests)
    .where(and(...conds))
    .orderBy(desc(tests.createdAt), tests.id)
    .$dynamic();
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.offset(opts.offset);
  const rows = await q;
  return hydrate(db, rows, opts.withReps ?? true);
}

async function hydrate(db: Db, rows: TestRow[], withReps: boolean): Promise<TestRecord[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const tagRows = await db.select().from(testTags).where(inArray(testTags.testId, ids));
  const repRows = withReps
    ? await db.select().from(reps).where(inArray(reps.testId, ids)).orderBy(reps.testId, reps.idx)
    : [];
  const metricRows: Array<typeof repMetrics.$inferSelect> = [];
  if (repRows.length) {
    for (const part of chunk(
      repRows.map((r) => r.id),
      2000,
    )) {
      metricRows.push(...(await db.select().from(repMetrics).where(inArray(repMetrics.repId, part))));
    }
  }
  const metricsByRep = new Map<string, Record<string, number | null>>();
  for (const m of metricRows) {
    const o = metricsByRep.get(m.repId) ?? {};
    o[m.metricKey] = m.value;
    metricsByRep.set(m.repId, o);
  }
  const repsByTest = new Map<string, RepRecord[]>();
  for (const r of repRows) {
    const rec: RepRecord = {
      id: r.id,
      index: r.idx,
      startIdx: r.startIdx,
      endIdx: r.endIdx,
      included: r.included,
      type: r.type as RepRecord['type'],
      confidence: r.confidence,
      side: r.side as RepRecord['side'],
      events: r.events,
      metrics: metricsByRep.get(r.id) ?? {},
      warnings: r.warnings,
      ...(r.leadIn ? { leadIn: true } : {}),
      ...(r.hopIndex !== null ? { hopIndex: r.hopIndex } : {}),
    };
    repsByTest.set(r.testId, [...(repsByTest.get(r.testId) ?? []), rec]);
  }
  return rows.map((t) => ({
    id: t.id,
    profileId: t.profileId,
    sessionId: t.sessionId,
    testType: t.testType as TestRecord['testType'],
    detectedType: t.detectedType as TestRecord['detectedType'],
    bodyMassKg: t.bodyMassKg,
    externalLoadKg: t.externalLoadKg,
    samplingHz: t.samplingHz,
    deviceSerial: t.deviceSerial,
    createdAt: t.createdAt.toISOString(),
    status: 'uploaded',
    tagIds: tagRows.filter((x) => x.testId === t.id).map((x) => x.tagId),
    conditions: t.conditions,
    recordingId: t.recordingId ?? '',
    zeroOffsets: { left: t.zeroLeft, right: t.zeroRight },
    notes: t.notes,
    reps: repsByTest.get(t.id) ?? [],
    analysisVersion: t.analysisVersion,
  }));
}

/** Darf der Nutzer diesen Test lesen/schreiben? (404 statt 403: keine Existenz-Auskunft) */
async function assertTestAccess(db: Db, p: Principal, row: TestRow, mode: 'read' | 'write'): Promise<void> {
  if (row.orgId !== p.orgId) throw notFound();
  if (row.profileId) {
    if (!canAccessGroups(p, await groupIdsOfProfile(db, row.profileId), mode)) throw notFound();
  } else if (p.groupScope === 'restricted' && row.createdBy !== p.id) {
    throw notFound();
  }
}

const listQuery = z.object({
  profileId: z.uuid().optional(),
  testType: z.string().max(400).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
  withReps: z.enum(['0', '1']).default('1'),
});

export const testRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db, blobs } = ctx;

    api.get('/tests', async (req) => {
      const p = requireCan(req, 'test.read');
      const q = parse(listQuery, req.query);
      const where: SQL[] = [];
      if (q.profileId) where.push(eq(tests.profileId, q.profileId));
      if (q.testType) where.push(inArray(tests.testType, q.testType.split(',').filter(Boolean)));
      if (q.from) where.push(gte(tests.createdAt, new Date(q.from)));
      if (q.to) where.push(lte(tests.createdAt, new Date(q.to)));
      return loadTests(db, p, { where, limit: q.limit, offset: q.offset, withReps: q.withReps === '1' });
    });

    api.get('/tests/:id', async (req) => {
      const p = requireCan(req, 'test.read');
      const id = paramId(req);
      const [row] = await db.select().from(tests).where(eq(tests.id, id));
      if (!row) throw notFound();
      await assertTestAccess(db, p, row, 'read');
      return (await hydrate(db, [row], true))[0]!;
    });

    /** Idempotenter Upload (Client-UUID). Gleicher Inhalt → 200 unchanged; abweichender Inhalt → 409 (Tests sind unveränderlich). */
    api.put('/tests/:id', async (req, reply) => {
      const p = requireCan(req, 'test.write');
      const id = paramId(req);
      const input = parse(testInput, req.body);
      if (input.id !== id) throw new HttpError(400, 'id_mismatch');
      const contentHash = createHash('sha256').update(stableStringify(input)).digest('hex');

      const [ex] = await db.select().from(tests).where(eq(tests.id, id));
      if (ex) {
        if (ex.orgId !== p.orgId) throw notFound();
        if (ex.contentHash === contentHash) return reply.send({ status: 'unchanged' });
        throw new HttpError(409, 'test_exists');
      }

      if (input.profileId) await assertProfileAccess(db, req, input.profileId, 'write');
      const [rec] = await db
        .select()
        .from(recordings)
        .where(and(eq(recordings.id, input.recordingId), eq(recordings.orgId, p.orgId)));
      if (!rec) throw new HttpError(409, 'recording_missing');
      if (rec.profileId && rec.profileId !== input.profileId)
        throw new HttpError(422, 'recording_profile_mismatch');
      if (input.tagIds.length) {
        const owned = await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.orgId, p.orgId), inArray(tags.id, input.tagIds)));
        if (owned.length !== new Set(input.tagIds).size) throw new HttpError(422, 'unknown_tag');
      }
      for (const r of input.reps)
        if (r.endIdx < r.startIdx || r.endIdx > rec.nSamples) throw new HttpError(422, 'rep_out_of_range');

      const known = new Set(
        (await db.select({ key: metricDefinitions.key }).from(metricDefinitions)).map((m) => m.key),
      );
      const ignored = new Set<string>();
      const metricRows: Array<{ repId: string; metricKey: string; value: number }> = [];
      for (const r of input.reps) {
        for (const [k, v] of Object.entries(r.metrics)) {
          if (v === null) continue;
          if (!known.has(k)) ignored.add(k);
          else metricRows.push({ repId: r.id, metricKey: k, value: v });
        }
      }

      await db.transaction(async (tx) => {
        await tx.insert(tests).values({
          id,
          orgId: p.orgId,
          profileId: input.profileId,
          sessionId: input.sessionId,
          testType: input.testType,
          detectedType: input.detectedType,
          bodyMassKg: input.bodyMassKg,
          externalLoadKg: input.externalLoadKg,
          samplingHz: input.samplingHz,
          deviceSerial: input.deviceSerial,
          createdAt: new Date(input.createdAt),
          createdBy: p.id,
          recordingId: input.recordingId,
          zeroLeft: input.zeroOffsets.left,
          zeroRight: input.zeroOffsets.right,
          notes: input.notes,
          analysisVersion: input.analysisVersion,
          conditions: input.conditions,
          contentHash,
        });
        if (input.reps.length) {
          await tx.insert(reps).values(
            input.reps.map((r) => ({
              id: r.id,
              testId: id,
              idx: r.index,
              startIdx: r.startIdx,
              endIdx: r.endIdx,
              included: r.included,
              type: r.type,
              confidence: r.confidence,
              side: r.side,
              events: r.events,
              warnings: r.warnings,
              leadIn: r.leadIn ?? false,
              hopIndex: r.hopIndex ?? null,
            })),
          );
        }
        for (const part of chunk(metricRows, 5000)) await tx.insert(repMetrics).values(part);
        if (input.tagIds.length)
          await tx
            .insert(testTags)
            .values([...new Set(input.tagIds)].map((tagId) => ({ testId: id, tagId })));
        if (!rec.profileId && input.profileId)
          await tx.update(recordings).set({ profileId: input.profileId }).where(eq(recordings.id, rec.id));
      });
      await audit(db, req, {
        orgId: p.orgId,
        action: 'test.create',
        entity: 'test',
        entityId: id,
        details: { testType: input.testType, reps: input.reps.length },
      });
      return reply.status(201).send({ status: 'created', ignoredMetrics: [...ignored] });
    });

    /** Nachbearbeiten (Hub): Notizen, Tags, Zuordnung zum Profil, Einschluss einzelner Wiederholungen. */
    api.patch('/tests/:id', async (req) => {
      const p = requireCan(req, 'test.write');
      const id = paramId(req);
      const patch = parse(testPatchInput, req.body);
      const [row] = await db.select().from(tests).where(eq(tests.id, id));
      if (!row) throw notFound();
      await assertTestAccess(db, p, row, 'write');
      if (patch.profileId) await assertProfileAccess(db, req, patch.profileId, 'write');
      if (patch.tagIds?.length) {
        const owned = await db
          .select({ id: tags.id })
          .from(tags)
          .where(and(eq(tags.orgId, p.orgId), inArray(tags.id, patch.tagIds)));
        if (owned.length !== new Set(patch.tagIds).size) throw new HttpError(422, 'unknown_tag');
      }
      await db.transaction(async (tx) => {
        const set: Partial<typeof tests.$inferInsert> = {};
        if (patch.notes !== undefined) set.notes = patch.notes;
        if (patch.profileId !== undefined) set.profileId = patch.profileId;
        if (Object.keys(set).length)
          await tx
            .update(tests)
            .set({ ...set, rev: sql`nextval('sync_rev_seq')` })
            .where(eq(tests.id, id));
        if (patch.profileId && row.recordingId)
          await tx
            .update(recordings)
            .set({ profileId: patch.profileId })
            .where(eq(recordings.id, row.recordingId));
        if (patch.tagIds) {
          await tx.delete(testTags).where(eq(testTags.testId, id));
          if (patch.tagIds.length)
            await tx
              .insert(testTags)
              .values([...new Set(patch.tagIds)].map((tagId) => ({ testId: id, tagId })));
        }
        for (const r of patch.reps ?? [])
          await tx
            .update(reps)
            .set({ included: r.included })
            .where(and(eq(reps.id, r.id), eq(reps.testId, id)));
      });
      await audit(db, req, {
        orgId: p.orgId,
        action: 'test.update',
        entity: 'test',
        entityId: id,
        details: { fields: Object.keys(patch) },
      });
      return (await hydrate(db, [(await db.select().from(tests).where(eq(tests.id, id)))[0]!], true))[0]!;
    });

    api.delete('/tests/:id', async (req, reply) => {
      const p = requireCan(req, 'test.delete');
      const id = paramId(req);
      const [row] = await db.select().from(tests).where(eq(tests.id, id));
      if (!row) throw notFound();
      await assertTestAccess(db, p, row, 'write');
      let orphan: { id: string; key: string } | null = null;
      await db.transaction(async (tx) => {
        await tx.delete(tests).where(eq(tests.id, id));
        if (row.recordingId) {
          const left = await tx
            .select({ id: tests.id })
            .from(tests)
            .where(eq(tests.recordingId, row.recordingId))
            .limit(1);
          if (!left.length) {
            const [rec] = await tx.delete(recordings).where(eq(recordings.id, row.recordingId)).returning();
            if (rec) orphan = { id: rec.id, key: rec.storageKey };
          }
        }
      });
      const o = orphan as { id: string; key: string } | null;
      if (o) await blobs.delete(o.key);
      await audit(db, req, { orgId: p.orgId, action: 'test.delete', entity: 'test', entityId: id });
      return reply.status(204).send();
    });
  };
