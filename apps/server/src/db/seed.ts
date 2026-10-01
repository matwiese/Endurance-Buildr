import { allMetrics } from '@buildr/core';
import { sql } from 'drizzle-orm';
import type { Db } from './client.ts';
import { metricDefinitions } from './schema.ts';

/** Schreibt die Metrik-Registry des Kerns in `metric_definitions` (idempotent; Registry ist die Wahrheit). */
export async function seedMetricDefinitions(db: Db): Promise<number> {
  const rows = allMetrics().map((m) => ({
    key: m.key,
    families: [...m.families],
    kind: m.kind,
    unit: m.unit,
    labelDe: m.label.de,
    labelEn: m.label.en,
    higherIsBetter: m.higherIsBetter ?? null,
    definition: {
      description: m.description,
      formula: m.formula,
      phase: m.phase,
      quantity: m.quantity,
      decimals: m.decimals,
      families: m.families,
    } as Record<string, unknown>,
  }));
  if (!rows.length) return 0;
  await db
    .insert(metricDefinitions)
    .values(rows)
    .onConflictDoUpdate({
      target: metricDefinitions.key,
      set: {
        families: sql`excluded.families`,
        kind: sql`excluded.kind`,
        unit: sql`excluded.unit`,
        labelDe: sql`excluded.label_de`,
        labelEn: sql`excluded.label_en`,
        higherIsBetter: sql`excluded.higher_is_better`,
        definition: sql`excluded.definition`,
      },
    });
  return rows.length;
}
