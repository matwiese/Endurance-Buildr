import type { FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import type { Principal } from './auth/permissions.ts';
import { can, type Action } from './auth/permissions.ts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export const notFound = (what = 'not_found') => new HttpError(404, what);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);

/** Validiert Eingaben; Fehler → 400 mit Feldliste. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(400, 'validation', 'Invalid input', {
      issues: r.error.issues
        .slice(0, 20)
        .map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    });
  }
  return r.data;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export function requireAuth(req: FastifyRequest): Principal {
  if (!req.principal) throw new HttpError(401, 'unauthenticated');
  return req.principal;
}

/** Prinzipal + Aktionsrecht (rollenbasiert); Gruppen-Scoping prüfen die Routen über `canAccessGroups`. */
export function requireCan(req: FastifyRequest, action: Action): Principal {
  const p = requireAuth(req);
  if (!can(p, action)) throw forbidden();
  return p;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function paramId(req: FastifyRequest, name = 'id'): string {
  const v = (req.params as Record<string, string>)[name];
  if (!v || !UUID_RE.test(v)) throw new HttpError(400, 'invalid_id');
  return v.toLowerCase();
}
