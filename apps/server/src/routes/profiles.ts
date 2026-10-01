import { profileInput, validateProfile, type ProfileDTO } from '@buildr/shared';
import { and, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { allowedGroupIds, canAccessGroups, type Principal } from '../auth/permissions.ts';
import type { Db } from '../db/client.ts';
import { groups, profileGroups, profiles, recordings } from '../db/schema.ts';
import { HttpError, notFound, paramId, parse, requireAuth, requireCan } from '../http.ts';
import { addTombstones } from './reference.ts';

type ProfileRow = typeof profiles.$inferSelect;

export const profileDto = (r: ProfileRow, groupIds: string[]): ProfileDTO => ({
  id: r.id,
  name: r.name,
  dateOfBirth: r.dateOfBirth,
  sex: r.sex,
  heightCm: r.heightCm,
  weightKg: r.weightKg,
  sport: r.sport,
  email: r.email,
  notes: r.notes,
  externalId: r.externalId,
  allowPhotoVideo: r.allowPhotoVideo,
  guardianConsent: r.guardianConsent,
  healthConsentAt: r.healthConsentAt?.toISOString() ?? null,
  healthConsentVersion: r.healthConsentVersion,
  groupIds,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Profile der Organisation, die der Nutzer lesen darf (Gruppen-Scoping). */
export async function loadProfiles(
  db: Db,
  p: Principal,
  opts: { where?: SQL; ids?: string[]; limit?: number; offset?: number; sinceRev?: number } = {},
): Promise<ProfileDTO[]> {
  const allowed = allowedGroupIds(p, 'read');
  const conds: SQL[] = [eq(profiles.orgId, p.orgId)];
  if (opts.where) conds.push(opts.where);
  if (opts.ids) conds.push(inArray(profiles.id, opts.ids));
  if (opts.sinceRev) conds.push(sql`${profiles.rev} > ${opts.sinceRev}`);
  if (allowed) {
    if (!allowed.length) return [];
    conds.push(
      sql`exists (select 1 from ${profileGroups} pg where pg.profile_id = ${profiles.id} and pg.group_id in (${sql.join(
        allowed.map((g) => sql`${g}`),
        sql`, `,
      )}))`,
    );
  }
  let q = db
    .select()
    .from(profiles)
    .where(and(...conds))
    .orderBy(profiles.name, profiles.id)
    .$dynamic();
  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset) q = q.offset(opts.offset);
  const rows = await q;
  if (!rows.length) return [];
  const links = await db
    .select()
    .from(profileGroups)
    .where(
      inArray(
        profileGroups.profileId,
        rows.map((r) => r.id),
      ),
    );
  const byProfile = new Map<string, string[]>();
  for (const l of links) byProfile.set(l.profileId, [...(byProfile.get(l.profileId) ?? []), l.groupId]);
  return rows.map((r) => profileDto(r, byProfile.get(r.id) ?? []));
}

/** Gruppen-IDs eines Profils (ohne Scoping) – für Rechteprüfungen. */
export async function groupIdsOfProfile(db: Db, profileId: string): Promise<string[]> {
  return (
    await db
      .select({ g: profileGroups.groupId })
      .from(profileGroups)
      .where(eq(profileGroups.profileId, profileId))
  ).map((r) => r.g);
}

/** Zugriff auf ein vorhandenes Profil (404, wenn nicht sichtbar – verrät nicht, ob es existiert). */
export async function assertProfileAccess(
  db: Db,
  req: FastifyRequest,
  profileId: string,
  mode: 'read' | 'write',
): Promise<{ row: ProfileRow; groupIds: string[] }> {
  const p = requireAuth(req);
  const [row] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.orgId, p.orgId)));
  if (!row) throw notFound();
  const groupIds = await groupIdsOfProfile(db, profileId);
  if (!canAccessGroups(p, groupIds, mode)) throw notFound();
  return { row, groupIds };
}

const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === '23505' || err?.cause?.code === '23505';
};

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  groupId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
});

export const profileRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db, blobs } = ctx;

    api.get('/profiles', async (req) => {
      const p = requireCan(req, 'profile.read');
      const q = parse(listQuery, req.query);
      const conds: SQL[] = [];
      if (q.q) conds.push(ilike(profiles.name, `%${q.q.replace(/[%_\\]/g, '\\$&')}%`));
      if (q.groupId)
        conds.push(
          sql`exists (select 1 from ${profileGroups} pg where pg.profile_id = ${profiles.id} and pg.group_id = ${q.groupId})`,
        );
      return loadProfiles(db, p, {
        where: conds.length ? and(...conds) : undefined,
        limit: q.limit,
        offset: q.offset,
      });
    });

    api.get('/profiles/:id', async (req) => {
      requireCan(req, 'profile.read');
      const id = paramId(req);
      await assertProfileAccess(db, req, id, 'read');
      const [dto] = await loadProfiles(db, req.principal!, { ids: [id] });
      if (!dto) throw notFound();
      return dto;
    });

    /** Idempotentes Anlegen/Ändern (Client-generierte UUID; bei Konflikt gewinnt der neuere `updatedAt`). */
    api.put('/profiles/:id', async (req, reply) => {
      const p = requireCan(req, 'profile.write');
      const id = paramId(req);
      const input = parse(profileInput, req.body);
      if (input.id !== id) throw new HttpError(400, 'id_mismatch');
      const issues = validateProfile(input, new Date(), {});
      const blocking = issues.filter((i) => i.code !== 'health_consent_required');
      if (blocking.length)
        throw new HttpError(422, 'profile_invalid', 'Profile rules violated', { issues: blocking });

      const owned = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.orgId, p.orgId), inArray(groups.id, input.groupIds)));
      if (owned.length !== new Set(input.groupIds).size) throw new HttpError(422, 'unknown_group');

      const [ex] = await db.select().from(profiles).where(eq(profiles.id, id));
      if (ex && ex.orgId !== p.orgId) throw notFound();
      const existingGroups = ex ? await groupIdsOfProfile(db, id) : [];
      let finalGroups = [...new Set(input.groupIds)];
      if (ex && !canAccessGroups(p, existingGroups, 'write')) throw notFound();
      if (p.groupScope === 'restricted') {
        const writable = new Set([...p.access].filter(([, a]) => a === 'write').map(([g]) => g));
        if (!input.groupIds.some((g) => writable.has(g)) && !existingGroups.some((g) => writable.has(g)))
          throw new HttpError(403, 'group_forbidden');
        // Gruppen außerhalb des eigenen Schreibbereichs bleiben unverändert
        finalGroups = [
          ...new Set([
            ...existingGroups.filter((g) => !writable.has(g)),
            ...input.groupIds.filter((g) => writable.has(g)),
          ]),
        ];
        if (!finalGroups.length) throw new HttpError(422, 'group_required');
      }

      const updatedAt = new Date(input.updatedAt);
      if (ex && ex.updatedAt.getTime() > updatedAt.getTime()) {
        const [dto] = await loadProfiles(db, p, { ids: [id] });
        return reply.send({ profile: dto ?? profileDto(ex, existingGroups), applied: false });
      }

      const values = {
        orgId: p.orgId,
        name: input.name,
        dateOfBirth: input.dateOfBirth,
        sex: input.sex,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        sport: input.sport,
        email: input.email,
        notes: input.notes,
        externalId: input.externalId,
        allowPhotoVideo: input.allowPhotoVideo,
        guardianConsent: input.guardianConsent,
        healthConsentAt: input.healthConsentAt ? new Date(input.healthConsentAt) : null,
        healthConsentVersion: input.healthConsentAt ? (input.healthConsentVersion ?? null) : null,
        updatedAt,
      };
      try {
        await db.transaction(async (tx) => {
          await tx
            .insert(profiles)
            .values({ id, ...values, createdAt: new Date(input.createdAt) })
            .onConflictDoUpdate({
              target: profiles.id,
              set: { ...values, rev: sql`nextval('sync_rev_seq')` },
            });
          await tx.delete(profileGroups).where(eq(profileGroups.profileId, id));
          await tx.insert(profileGroups).values(finalGroups.map((groupId) => ({ profileId: id, groupId })));
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new HttpError(409, 'external_id_taken');
        throw e;
      }
      await audit(db, req, {
        orgId: p.orgId,
        action: ex ? 'profile.update' : 'profile.create',
        entity: 'profile',
        entityId: id,
        details: ex ? { groups: finalGroups.length } : undefined,
      });
      const [dto] = await loadProfiles(db, p, { ids: [id] });
      return reply.status(ex ? 200 : 201).send({ profile: dto, applied: true });
    });

    /** DSGVO-Löschung: Profil, Tests, Messwerte und Roh-Aufnahmen (inkl. Blobs) endgültig entfernen. */
    api.delete('/profiles/:id', async (req, reply) => {
      const p = requireCan(req, 'profile.delete');
      const id = paramId(req);
      await assertProfileAccess(db, req, id, 'write');
      const recs = await db
        .select({ id: recordings.id, key: recordings.storageKey })
        .from(recordings)
        .where(eq(recordings.profileId, id));
      await db.transaction(async (tx) => {
        if (recs.length)
          await tx.delete(recordings).where(
            inArray(
              recordings.id,
              recs.map((r) => r.id),
            ),
          );
        await addTombstones(tx, p.orgId, 'profile', [id]);
        await tx.delete(profiles).where(eq(profiles.id, id));
      });
      for (const r of recs) await blobs.delete(r.key);
      await audit(db, req, {
        orgId: p.orgId,
        action: 'profile.delete',
        entity: 'profile',
        entityId: id,
        details: { recordings: recs.length },
      });
      return reply.status(204).send();
    });
  };
