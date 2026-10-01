import type { SyncPullDTO } from '@buildr/shared';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { allowedGroupIds } from '../auth/permissions.ts';
import { categories, groups, tagTypes, tags, tombstones } from '../db/schema.ts';
import { parse, requireCan } from '../http.ts';
import { loadProfiles } from './profiles.ts';

/**
 * Sicherheitsfenster (in Änderungsnummern): Sequenzwerte werden vor dem Commit vergeben; eine länger laufende Transaktion
 * könnte sonst nach dem Cursor sichtbar werden. Mehrfach gelieferte Zeilen sind unkritisch (der Client merged idempotent).
 */
const OVERLAP = 64;

const pullQuery = z.object({ since: z.coerce.number().int().min(0).default(0) });

export const syncRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db } = ctx;

    /** Stammdaten-Abgleich (Profile, Kategorien, Gruppen, Tag-Typen, Tags, Löschungen) seit Änderungsnummer `since`. */
    api.get('/sync/pull', async (req): Promise<SyncPullDTO> => {
      const p = requireCan(req, 'profile.read');
      const { since } = parse(pullQuery, req.query);
      const full = since === 0;
      const floor = full ? 0 : Math.max(0, since - OVERLAP);

      // Cursor vor den Abfragen festhalten: alles bis hierhin ist in der Antwort enthalten
      const seq = await db.execute(sql`select last_value::bigint as last_value, is_called from sync_rev_seq`);
      const row = ((seq as unknown as { rows?: Array<{ last_value: string | number; is_called: boolean }> })
        .rows ?? [])[0];
      const cursor = row?.is_called ? Number(row.last_value) : 0;

      const allowed = allowedGroupIds(p, 'read');
      const [cats, grs, tts, tgs, profs, dead] = await Promise.all([
        db
          .select()
          .from(categories)
          .where(and(eq(categories.orgId, p.orgId), gt(categories.rev, floor))),
        db
          .select()
          .from(groups)
          .where(and(eq(groups.orgId, p.orgId), gt(groups.rev, floor))),
        db
          .select()
          .from(tagTypes)
          .where(and(eq(tagTypes.orgId, p.orgId), gt(tagTypes.rev, floor))),
        db
          .select()
          .from(tags)
          .where(and(eq(tags.orgId, p.orgId), gt(tags.rev, floor))),
        loadProfiles(db, p, { sinceRev: floor }),
        full
          ? Promise.resolve([])
          : db
              .select()
              .from(tombstones)
              .where(and(eq(tombstones.orgId, p.orgId), gt(tombstones.rev, floor))),
      ]);
      const ENTITIES = new Set<SyncPullDTO['deleted'][number]['entity']>([
        'profile',
        'category',
        'group',
        'tagType',
        'tag',
      ]);
      return {
        cursor: Math.max(cursor, 0),
        full,
        profiles: profs,
        categories: cats.map(({ id, name }) => ({ id, name })),
        groups: grs
          .filter((g) => !allowed || allowed.includes(g.id))
          .map(({ id, categoryId, name }) => ({ id, categoryId, name })),
        tagTypes: tts.map(({ id, name }) => ({ id, name })),
        tags: tgs.map(({ id, tagTypeId, name }) => ({ id, tagTypeId, name })),
        deleted: dead.flatMap((d) =>
          ENTITIES.has(d.entity as never)
            ? [{ entity: d.entity as SyncPullDTO['deleted'][number]['entity'], id: d.entityId }]
            : [],
        ),
      };
    });
  };
