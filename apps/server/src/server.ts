import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { loadConfig, type Config } from './config.ts';
import { openDb, type DbHandle } from './db/client.ts';
import { seedMetricDefinitions } from './db/seed.ts';
import { createOrganizationWithAdmin } from './routes/auth.ts';
import { FileBlobStore, type BlobStore } from './storage/blobStore.ts';
import { count } from 'drizzle-orm';
import { users } from './db/schema.ts';

export interface Server {
  app: FastifyInstance;
  handle: DbHandle;
  config: Config;
  close(): Promise<void>;
}

/** Baut Datenbank, Migrationen, Seeds und die Fastify-App (ohne zu lauschen). */
export async function createServer(
  overrides: Partial<Record<string, string>> = {},
  opts: { memory?: boolean; blobs?: BlobStore } = {},
): Promise<Server> {
  const config = loadConfig({ ...process.env, ...overrides });
  const handle = await openDb(config, { memory: opts.memory });
  await seedMetricDefinitions(handle.db);
  const blobs = opts.blobs ?? new FileBlobStore(config.BLOB_DIR);
  const ctx = { config, db: handle.db, blobs, dbKind: handle.kind };

  // Erstinstallation per Umgebungsvariablen (alternativ: Wizard der Web-App über /api/auth/setup)
  if (config.BOOTSTRAP_ADMIN_EMAIL && config.BOOTSTRAP_ADMIN_PASSWORD) {
    const [{ n }] = await handle.db.select({ n: count() }).from(users);
    if (n === 0) {
      await createOrganizationWithAdmin(ctx, {
        organization: config.BOOTSTRAP_ORG,
        name: 'Administrator',
        email: config.BOOTSTRAP_ADMIN_EMAIL,
        password: config.BOOTSTRAP_ADMIN_PASSWORD,
      });
    }
  }
  const app = await buildApp(ctx);
  return {
    app,
    handle,
    config,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}
