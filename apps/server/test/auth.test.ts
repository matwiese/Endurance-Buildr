import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  addUser,
  client,
  cookieOf,
  login,
  makeServer,
  setupAdmin,
  type Client,
  type TestServer,
} from './helpers.ts';

describe('Auth', () => {
  let s: TestServer;
  let admin: Client;
  beforeAll(async () => {
    s = await makeServer();
  });
  afterAll(() => s.close());

  it('ohne Anmeldung: Health/Status öffentlich, alles andere 401', async () => {
    const c = client(s);
    expect((await c.get('/api/health')).json()).toMatchObject({
      ok: true,
      db: expect.stringMatching(/^(pglite|postgres)$/),
    });
    expect((await c.get('/api/auth/status')).json()).toEqual({ setupRequired: true });
    for (const url of [
      '/api/profiles',
      '/api/tests',
      '/api/reference',
      '/api/users',
      '/api/audit',
      '/api/metrics',
      '/api/sync/pull',
    ]) {
      expect((await c.get(url)).statusCode, url).toBe(401);
    }
  });

  it('Wizard legt Organisation + Admin an – nur einmal', async () => {
    const bad = await client(s).post('/api/auth/setup', {
      organization: 'X',
      name: 'A',
      email: 'a@x.test',
      password: 'short',
    });
    expect(bad.statusCode).toBe(422);
    admin = await setupAdmin(s);
    expect((await client(s).get('/api/auth/status')).json()).toEqual({ setupRequired: false });
    const again = await client(s).post('/api/auth/setup', {
      organization: 'Y',
      name: 'B',
      email: 'b@x.test',
      password: PASSWORD,
    });
    expect(again.statusCode).toBe(409);
    const me = (await admin.get('/api/auth/me')).json();
    expect(me).toMatchObject({
      email: 'admin@example.test',
      role: 'admin',
      groupScope: 'all',
      organization: { name: 'Test Org' },
    });
    // Standardkategorie/-gruppe
    const ref = (await admin.get('/api/reference')).json();
    expect(ref.groups.map((g: { name: string }) => g.name)).toEqual(['Alle Athleten']);
  });

  it('Wizard: gleichzeitige Aufrufe legen nur einen Administrator an', async () => {
    const t = await makeServer();
    const body = (i: number) => ({
      organization: `Org ${i}`,
      name: 'A',
      email: `a${i}@x.test`,
      password: PASSWORD,
    });
    const res = await Promise.all([1, 2, 3].map((i) => client(t).post('/api/auth/setup', body(i))));
    expect(res.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    await t.close();
  });

  it('Login: Cookie ist httpOnly + SameSite=Lax; falsche Daten → 401 ohne Hinweis ob Nutzer existiert', async () => {
    const res = await client(s).post('/api/auth/login', { email: 'ADMIN@example.test', password: PASSWORD });
    expect(res.statusCode).toBe(200);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const wrong = await client(s).post('/api/auth/login', {
      email: 'admin@example.test',
      password: 'x'.repeat(12),
    });
    const unknown = await client(s).post('/api/auth/login', {
      email: 'nobody@example.test',
      password: 'x'.repeat(12),
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('Logout beendet die Sitzung serverseitig', async () => {
    const c = await login(s, 'admin@example.test');
    expect((await c.get('/api/auth/me')).statusCode).toBe(200);
    expect((await c.post('/api/auth/logout')).statusCode).toBe(200);
    expect((await c.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('Drosselung: nach zu vielen Fehlversuchen 429 (auch mit richtigem Passwort)', async () => {
    const t = await makeServer({ LOGIN_MAX_ATTEMPTS: '3' });
    await setupAdmin(t);
    const c = client(t);
    for (let i = 0; i < 3; i++)
      expect(
        (await c.post('/api/auth/login', { email: 'admin@example.test', password: 'wrongwrongwrong' }))
          .statusCode,
      ).toBe(401);
    expect(
      (await c.post('/api/auth/login', { email: 'admin@example.test', password: PASSWORD })).statusCode,
    ).toBe(429);
    await t.close();
  });

  it('Passwortwechsel: altes Passwort nötig, andere Sitzungen enden', async () => {
    const t = await makeServer();
    await setupAdmin(t);
    const a = await login(t, 'admin@example.test');
    const b = await login(t, 'admin@example.test');
    expect(
      (await a.post('/api/auth/password', { current: 'falsch-falsch', next: 'neues-passwort-123' }))
        .statusCode,
    ).toBe(403);
    expect((await a.post('/api/auth/password', { current: PASSWORD, next: 'kurz' })).statusCode).toBe(422);
    const ok = await a.post('/api/auth/password', { current: PASSWORD, next: 'neues-passwort-123' });
    expect(ok.statusCode).toBe(200);
    expect((await b.get('/api/auth/me')).statusCode).toBe(401);
    expect((await client(t, cookieOf(ok)).get('/api/auth/me')).statusCode).toBe(200);
    expect(
      (await client(t).post('/api/auth/login', { email: 'admin@example.test', password: PASSWORD }))
        .statusCode,
    ).toBe(401);
    await login(t, 'admin@example.test', 'neues-passwort-123');
    await t.close();
  });

  it('CSRF: Schreibzugriff mit fremdem Origin wird abgelehnt, eigener/kein Origin erlaubt', async () => {
    const c = await login(s, 'admin@example.test');
    const evil = await c.req('POST', '/api/auth/logout', undefined, {
      origin: 'https://evil.example',
      host: 'localhost:3000',
    });
    expect(evil.statusCode).toBe(403);
    expect((await c.get('/api/auth/me')).statusCode).toBe(200);
    const same = await c.req(
      'POST',
      '/api/auth/password',
      { current: 'x'.repeat(11), next: 'y'.repeat(12) },
      { origin: 'http://localhost:3000', host: 'localhost:3000' },
    );
    expect(same.statusCode).toBe(403); // falsches Passwort (nicht Origin)
    expect(same.json().error).toBe('invalid_credentials');
  });

  it('deaktivierte Nutzer: Sitzung sofort ungültig, kein Login', async () => {
    const t = await makeServer();
    const a = await setupAdmin(t);
    const u = await addUser(t, a, 'tester@example.test', 'tester');
    const id = (await u.get('/api/auth/me')).json().id;
    expect((await a.patch(`/api/users/${id}`, { active: false })).statusCode).toBe(200);
    expect((await u.get('/api/auth/me')).statusCode).toBe(401);
    expect(
      (await client(t).post('/api/auth/login', { email: 'tester@example.test', password: PASSWORD }))
        .statusCode,
    ).toBe(401);
    await t.close();
  });
});
