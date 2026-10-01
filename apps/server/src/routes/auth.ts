import { randomUUID } from 'node:crypto';
import { loginInput, passwordChangeInput, setupInput, type MeDTO } from '@buildr/shared';
import { count, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { hashPassword, passwordIssue, verifyPassword } from '../auth/password.ts';
import { COOKIE_NAME, createSession, destroySession, destroyUserSessions } from '../auth/sessions.ts';
import { categories, groups, organizations, userGroupAccess, users } from '../db/schema.ts';
import { HttpError, parse, requireAuth } from '../http.ts';

/** Gleitfenster-Drosselung der Anmeldeversuche (je IP+E-Mail und je IP). */
class LoginThrottle {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}
  private prune(key: string, now: number): number[] {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length) this.hits.set(key, arr);
    else this.hits.delete(key);
    return arr;
  }
  blocked(keys: string[], now = Date.now()): boolean {
    return keys.some((k) => this.prune(k, now).length >= this.max);
  }
  fail(keys: string[], now = Date.now()): void {
    for (const k of keys) this.hits.set(k, [...this.prune(k, now), now]);
  }
  reset(key: string): void {
    this.hits.delete(key);
  }
}

export async function createOrganizationWithAdmin(
  ctx: AppContext,
  input: { organization: string; name: string; email: string; password: string },
  opts: { onlyIfEmpty?: boolean } = {},
): Promise<{ orgId: string; userId: string }> {
  const issue = passwordIssue(input.password);
  if (issue) throw new HttpError(422, `password_${issue}`);
  const orgId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await hashPassword(input.password, ctx.config.SCRYPT_LOG_N);
  await ctx.db.transaction(async (tx) => {
    if (opts.onlyIfEmpty) {
      // Wizard: zwei gleichzeitige Aufrufe dürfen nicht beide Administratoren anlegen
      await tx.execute(sql`select pg_advisory_xact_lock(7243001)`);
      const [{ n }] = await tx.select({ n: count() }).from(users);
      if (n > 0) throw new HttpError(409, 'already_set_up');
    }
    await tx.insert(organizations).values({ id: orgId, name: input.organization });
    await tx.insert(users).values({
      id: userId,
      orgId,
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
      role: 'admin',
      groupScope: 'all',
    });
    const catId = randomUUID();
    await tx.insert(categories).values({ id: catId, orgId, name: 'Allgemein' });
    await tx.insert(groups).values({ id: randomUUID(), orgId, categoryId: catId, name: 'Alle Athleten' });
  });
  return { orgId, userId };
}

export const authRoutes =
  (ctx: AppContext): FastifyPluginAsync =>
  async (api) => {
    const { db, config } = ctx;
    const throttle = new LoginThrottle(config.LOGIN_MAX_ATTEMPTS, config.LOGIN_WINDOW_MIN * 60_000);
    // Scheinhash gegen Zeitunterschiede bei unbekannten Nutzern
    const dummyHash = await hashPassword('dummy-password-for-timing', config.SCRYPT_LOG_N);

    const setCookie = (reply: FastifyReply, token: string, expires: Date) =>
      reply.setCookie(COOKIE_NAME, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.COOKIE_SECURE,
        expires,
      });

    const meFor = async (userId: string): Promise<MeDTO> => {
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (!u) throw new HttpError(401, 'unauthenticated');
      const [org] = await db.select().from(organizations).where(eq(organizations.id, u.orgId));
      const access =
        u.groupScope === 'restricted'
          ? (await db.select().from(userGroupAccess).where(eq(userGroupAccess.userId, userId))).map((a) => ({
              groupId: a.groupId,
              access: a.access,
            }))
          : [];
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        groupScope: u.groupScope,
        organization: { id: u.orgId, name: org?.name ?? '' },
        access,
      };
    };

    api.get('/auth/status', async () => {
      const [{ n }] = await db.select({ n: count() }).from(users);
      return { setupRequired: n === 0 };
    });

    api.post('/auth/setup', async (req, reply) => {
      const input = parse(setupInput, req.body);
      const { orgId, userId } = await createOrganizationWithAdmin(ctx, input, { onlyIfEmpty: true });
      await audit(db, req, { orgId, userId, userEmail: input.email, action: 'auth.setup' });
      const { token, expiresAt } = await createSession(
        db,
        userId,
        config.SESSION_TTL_DAYS,
        req.headers['user-agent'],
      );
      setCookie(reply, token, expiresAt);
      return reply.status(201).send({ ok: true });
    });

    api.post('/auth/login', async (req, reply) => {
      const input = parse(loginInput, req.body);
      const email = input.email.toLowerCase();
      const keys = [`${req.ip}|${email}`, `${req.ip}`];
      if (throttle.blocked(keys)) throw new HttpError(429, 'too_many_attempts');
      const [u] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      const ok = await verifyPassword(input.password, u?.passwordHash ?? dummyHash);
      if (!u || !ok || !u.active) {
        throttle.fail(keys);
        if (u)
          await audit(db, req, {
            orgId: u.orgId,
            userId: u.id,
            userEmail: u.email,
            action: 'auth.login_failed',
          });
        throw new HttpError(401, 'invalid_credentials');
      }
      throttle.reset(keys[0]!);
      const { token, expiresAt } = await createSession(
        db,
        u.id,
        config.SESSION_TTL_DAYS,
        req.headers['user-agent'],
      );
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
      await audit(db, req, { orgId: u.orgId, userId: u.id, userEmail: u.email, action: 'auth.login' });
      setCookie(reply, token, expiresAt);
      return reply.send(await meFor(u.id));
    });

    api.post('/auth/logout', async (req, reply) => {
      const token = req.cookies[COOKIE_NAME];
      if (token) await destroySession(db, token);
      if (req.principal) await audit(db, req, { orgId: req.principal.orgId, action: 'auth.logout' });
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return { ok: true };
    });

    api.get('/auth/me', async (req) => meFor(requireAuth(req).id));

    api.post('/auth/password', async (req, reply) => {
      const p = requireAuth(req);
      const input = parse(passwordChangeInput, req.body);
      const [u] = await db.select().from(users).where(eq(users.id, p.id));
      if (!u || !(await verifyPassword(input.current, u.passwordHash)))
        throw new HttpError(403, 'invalid_credentials');
      const issue = passwordIssue(input.next);
      if (issue) throw new HttpError(422, `password_${issue}`);
      await db
        .update(users)
        .set({ passwordHash: await hashPassword(input.next, config.SCRYPT_LOG_N) })
        .where(eq(users.id, p.id));
      // alle bestehenden Sitzungen beenden, neue für dieses Gerät ausstellen
      await destroyUserSessions(db, p.id);
      const { token, expiresAt } = await createSession(
        db,
        p.id,
        config.SESSION_TTL_DAYS,
        req.headers['user-agent'],
      );
      setCookie(reply, token, expiresAt);
      await audit(db, req, { orgId: p.orgId, action: 'auth.password_change' });
      return { ok: true };
    });
  };
