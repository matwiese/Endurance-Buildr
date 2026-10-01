import { resolve } from 'node:path';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  /** PostgreSQL-URL; ohne Angabe läuft eine eingebettete PGlite-Datenbank unter DATA_DIR */
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default('.data'),
  /** Verzeichnis für Roh-Aufnahmen (Standard: DATA_DIR/blobs) */
  BLOB_DIR: z.string().optional(),
  MAX_BLOB_MB: z.coerce.number().positive().default(64),
  SESSION_TTL_DAYS: z.coerce.number().positive().default(14),
  /** Secure-Cookie; Standard: nur in Produktion */
  COOKIE_SECURE: bool.optional(),
  /** Komma-getrennte Ursprünge, die Cookie-Anfragen stellen dürfen (zusätzlich zum eigenen Host) */
  ALLOWED_ORIGINS: z.string().default(''),
  TRUST_PROXY: bool.default(false),
  /** scrypt-Kosten (2^n); in Tests niedrig */
  SCRYPT_LOG_N: z.coerce.number().int().min(10).max(20).default(15),
  /** Erstinstallation ohne Wizard */
  BOOTSTRAP_ORG: z.string().default('Buildr Force'),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  LOGIN_WINDOW_MIN: z.coerce.number().positive().default(15),
  /** Statische Web-App ausliefern (Produktions-Build) */
  WEB_DIST: z.string().optional(),
});

export type Config = Omit<z.infer<typeof schema>, 'COOKIE_SECURE' | 'BLOB_DIR'> & {
  COOKIE_SECURE: boolean;
  BLOB_DIR: string;
  allowedOrigins: string[];
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const c = schema.parse(env);
  // Relative Pfade gelten ab dem Verzeichnis, in dem der Befehl eingegeben wurde (pnpm setzt INIT_CWD) – nicht ab apps/server
  const base = env['INIT_CWD'] ?? process.cwd();
  const dataDir = resolve(base, c.DATA_DIR);
  return {
    ...c,
    DATA_DIR: dataDir,
    BLOB_DIR: resolve(base, c.BLOB_DIR ?? `${dataDir}/blobs`),
    WEB_DIST: c.WEB_DIST ? resolve(base, c.WEB_DIST) : undefined,
    COOKIE_SECURE: c.COOKIE_SECURE ?? c.NODE_ENV === 'production',
    allowedOrigins: c.ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
