import { and, eq, inArray, or } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { auditLog, groups, recordings, sessions, tests } from '../db/schema.ts';
import { paramId, requireCan } from '../http.ts';
import { assertProfileAccess, loadProfiles } from './profiles.ts';
import { loadTests } from './tests.ts';

/**
 * Auskunft/Datenübertragbarkeit (Art. 15/20 DSGVO): alle zu einer Person gespeicherten Daten als JSON (Profil, Gruppen, Tests mit Wiederholungen
 * und Kennzahlen, Verweise auf die Roh-Aufnahmen, Sessions, Protokolleinträge zur Person). Der Export wird protokolliert.
 */
export const exportRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db } = ctx;

    api.get('/profiles/:id/export', async (req, reply) => {
      const p = requireCan(req, 'export');
      const id = paramId(req);
      await assertProfileAccess(db, req, id, 'read');
      const [profile] = await loadProfiles(db, p, { ids: [id] });
      const personTests = await loadTests(db, p, { where: [eq(tests.profileId, id)] });
      const recs = await db
        .select()
        .from(recordings)
        .where(and(eq(recordings.orgId, p.orgId), eq(recordings.profileId, id)));
      const sessionIds = [...new Set(personTests.map((t) => t.sessionId).filter((x): x is string => !!x))];
      const sess = sessionIds.length
        ? await db
            .select()
            .from(sessions)
            .where(and(eq(sessions.orgId, p.orgId), inArray(sessions.id, sessionIds)))
        : [];
      const groupRows =
        profile && profile.groupIds.length
          ? await db.select().from(groups).where(inArray(groups.id, profile.groupIds))
          : [];
      const events = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.orgId, p.orgId),
            or(
              and(eq(auditLog.entity, 'profile'), eq(auditLog.entityId, id)),
              inArray(auditLog.entityId, personTests.map((t) => t.id).concat(['-'])),
            ),
          ),
        )
        .orderBy(auditLog.id);
      await audit(db, req, {
        orgId: p.orgId,
        action: 'profile.export',
        entity: 'profile',
        entityId: id,
        details: { tests: personTests.length },
      });
      return reply.header('Content-Disposition', `attachment; filename="export-${id}.json"`).send({
        format: 'buildr-force-person-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        profile,
        groups: groupRows.map((g) => ({ id: g.id, name: g.name })),
        tests: personTests,
        recordings: recs.map((r) => ({
          id: r.id,
          hz: r.hz,
          nSamples: r.nSamples,
          sizeBytes: r.sizeBytes,
          sha256: r.sha256,
          format: 'BFB1',
          url: `/api/recordings/${r.id}`,
          createdAt: r.createdAt.toISOString(),
        })),
        sessions: sess.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
        })),
        auditEvents: events.map((e) => ({
          at: e.at.toISOString(),
          action: e.action,
          user: e.userEmail,
          entity: e.entity,
        })),
      });
    });
  };
