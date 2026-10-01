import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { COOKIE_NAME, principalFromToken } from './auth/sessions.ts';
import type { Config } from './config.ts';
import type { Db } from './db/client.ts';
import { HttpError } from './http.ts';
import { auditRoutes } from './routes/audit.ts';
import { authRoutes } from './routes/auth.ts';
import { metricRoutes } from './routes/metrics.ts';
import { profileRoutes } from './routes/profiles.ts';
import { recordingRoutes } from './routes/recordings.ts';
import { referenceRoutes } from './routes/reference.ts';
import { syncRoutes } from './routes/sync.ts';
import { testRoutes } from './routes/tests.ts';
import { userRoutes } from './routes/users.ts';
import type { BlobStore } from './storage/blobStore.ts';

export interface AppContext {
  config: Config;
  db: Db;
  blobs: BlobStore;
  dbKind: 'postgres' | 'pglite';
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PUBLIC = new Set(['/api/health', '/api/auth/status', '/api/auth/setup', '/api/auth/login']);

export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const { config } = ctx;
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test' ? false : { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(cookie);
  app.decorateRequest('principal', null);

  // Roh-Aufnahmen (Binär) – eigenes Größenlimit
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: config.MAX_BLOB_MB * 1024 * 1024 },
    (_req, body, done) => done(null, body),
  );

  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    if (!req.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    // CSRF (zusätzlich zu SameSite=Lax): Cookie-authentifizierte Schreibzugriffe nur vom eigenen Ursprung
    if (UNSAFE.has(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== 'null') {
        let host: string;
        try {
          host = new URL(origin).host;
        } catch {
          throw new HttpError(403, 'bad_origin');
        }
        const ok = host === req.headers.host || config.allowedOrigins.includes(origin);
        if (!ok) throw new HttpError(403, 'bad_origin');
      }
    }
  });

  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    const path = req.url.split('?')[0]!;
    const token = req.cookies[COOKIE_NAME];
    req.principal = await principalFromToken(ctx.db, token);
    if (!req.principal && !PUBLIC.has(path)) throw new HttpError(401, 'unauthenticated');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.code, message: err.message, ...err.extra });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'validation', issues: err.issues.slice(0, 20) });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: e.code ?? 'bad_request', message: e.message });
    }
    req.log.error({ err }, 'unhandled');
    return reply.status(500).send({ error: 'internal' });
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'not_found' });
    // SPA-Fallback (nur wenn die Web-App ausgeliefert wird)
    if (config.WEB_DIST && req.method === 'GET') return reply.sendFile('index.html');
    return reply.status(404).send({ error: 'not_found' });
  });

  await app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true, db: ctx.dbKind }));
      await api.register(authRoutes(ctx));
      await api.register(userRoutes(ctx));
      await api.register(referenceRoutes(ctx));
      await api.register(profileRoutes(ctx));
      await api.register(testRoutes(ctx));
      await api.register(recordingRoutes(ctx));
      await api.register(syncRoutes(ctx));
      await api.register(metricRoutes(ctx));
      await api.register(auditRoutes(ctx));
    },
    { prefix: '/api' },
  );

  if (config.WEB_DIST && existsSync(config.WEB_DIST)) {
    await app.register(fastifyStatic, { root: config.WEB_DIST, wildcard: false });
  }
  return app;
}
