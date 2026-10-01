import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../app.ts';
import { metricDefinitions } from '../db/schema.ts';
import { requireAuth } from '../http.ts';

export const metricRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    /** Metrik-Definitionen (aus der Registry des Kerns beim Start eingespielt). */
    api.get('/metrics', async (req) => {
      requireAuth(req);
      const rows = await ctx.db.select().from(metricDefinitions).orderBy(metricDefinitions.key);
      return rows.map((r) => ({
        key: r.key,
        families: r.families,
        kind: r.kind,
        unit: r.unit,
        label: { de: r.labelDe, en: r.labelEn },
        higherIsBetter: r.higherIsBetter,
      }));
    });
  };
