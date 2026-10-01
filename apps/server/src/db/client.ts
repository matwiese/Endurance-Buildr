import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleLite } from 'drizzle-orm/pglite';
import { migrate as migrateLite } from 'drizzle-orm/pglite/migrator';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import pg from 'pg';
import type { Config } from '../config.ts';
import * as schema from './schema.ts';

/** Gemeinsamer Typ für node-postgres und PGlite (und Transaktionen). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

export interface DbHandle {
  db: Db;
  kind: 'postgres' | 'pglite';
  close(): Promise<void>;
}

const MIGRATIONS = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Öffnet die Datenbank und wendet ausstehende Migrationen an.
 * `DATABASE_URL` → PostgreSQL, sonst PGlite (Verzeichnis unter DATA_DIR/pg; `memory://` für Tests).
 */
export async function openDb(
  config: Pick<Config, 'DATABASE_URL' | 'DATA_DIR'>,
  opts: { memory?: boolean } = {},
): Promise<DbHandle> {
  if (config.DATABASE_URL && !opts.memory) {
    const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
    // Fehler an Leerlauf-Verbindungen (z. B. DB-Neustart) dürfen den Prozess nicht beenden; der Pool baut neu auf
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    return { db, kind: 'postgres', close: () => pool.end() };
  }
  let dir: string | undefined;
  if (!opts.memory) {
    dir = `${config.DATA_DIR}/pg`;
    mkdirSync(dir, { recursive: true });
  }
  const lite = new PGlite(dir);
  await lite.waitReady;
  const db = drizzleLite(lite, { schema });
  await migrateLite(db, { migrationsFolder: MIGRATIONS });
  return { db, kind: 'pglite', close: () => lite.close() };
}
