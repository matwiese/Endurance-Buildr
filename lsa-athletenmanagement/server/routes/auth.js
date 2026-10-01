import { HttpError, badRequest, forbidden, notFound } from '../http.js';
import { hashPassword, verifyPassword, dummyVerify, validatePassword, audit, writeAudit } from '../auth.js';
import { getSetting, setSetting } from '../db.js';
import { ROLES, MATRIX, effectivePerms, scopeOf, publicMeta } from '../permissions.js';
import { str, nowIso } from '../util.js';
import { VERSION } from '../config.js';
import { catalogForClient } from '../catalog.js';

export function userDto(u) {
  const perms = effectivePerms(u);
  return {
    id: u.id, username: u.username, displayName: u.display_name, role: u.role, roleLabel: ROLES[u.role]?.label || u.role,
    email: u.email, phone: u.phone, functionTitle: u.function_title, athleteId: u.athlete_id, active: !!u.active,
    mustChangePw: !!u.must_change_pw, demo: !!u.demo, scope: scopeOf(u), overridden: perms.overridden, overrideCount: perms.overrideCount,
  };
}

export function sessionPayload(app, ctx) {
  const { db, config } = app;
  const setupRequired = db.get('SELECT COUNT(*) AS n FROM users').n === 0;
  const base = { setupRequired, version: VERSION, orgName: getSetting(db, 'org_name', 'LSA') };
  if (!ctx.user) return { ...base, authenticated: false };
  const perms = effectivePerms(ctx.user);
  return {
    ...base,
    authenticated: true,
    user: userDto(ctx.user),
    realUser: ctx.realUser ? userDto(ctx.realUser) : null,
    permissions: perms,
    matrix: MATRIX[ctx.user.role] || [],
    testMode: !!getSetting(db, 'test_mode', true),
    sports: getSetting(db, 'sports', []),
    athletePrefix: getSetting(db, 'athlete_prefix', 'LSA'),
  };
}

export function register(app) {
  const { router, db, config, auth } = app;

  router.get('/api/session', { auth: false }, (ctx) => sessionPayload(app, ctx));
  router.get('/api/meta', () => ({ ...publicMeta(), catalog: catalogForClient() }));

  // Ersteinrichtung: nur solange noch keine Person existiert
  router.post('/api/setup', { auth: false }, async (ctx) => {
    if (db.get('SELECT COUNT(*) AS n FROM users').n > 0) throw new HttpError(409, 'Die Einrichtung wurde bereits durchgeführt.');
    const b = await ctx.json();
    const displayName = str(b.displayName, 100), username = str(b.username, 40).toLowerCase(), orgName = str(b.orgName, 100) || 'LSA';
    if (!displayName) throw badRequest('Bitte einen Namen angeben.');
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw badRequest('Benutzername: 3–40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Unterstrich, Bindestrich.');
    const pwErr = validatePassword(b.password, username);
    if (pwErr) throw badRequest(pwErr);
    const hash = await hashPassword(b.password);
    const now = nowIso();
    const id = db.tx(() => {
      const r = db.run(
        `INSERT INTO users(username, display_name, role, pw_hash, must_change_pw, active, scope_all, created_at, created_by, updated_at, pw_changed_at)
         VALUES (?,?,?,?,0,1,1,?,?,?,?)`, username, displayName, 'admin', hash, now, 'Ersteinrichtung', now, now);
      setSetting(db, 'org_name', orgName);
      return r.lastInsertRowid;
    });
    ctx.user = db.get('SELECT * FROM users WHERE id = ?', id);
    ctx.setCookies = [];
    auth.createSession(ctx, id);
    audit(db, ctx, { area: 'System', action: 'Ersteinrichtung abgeschlossen, Administrator angelegt' });
    return sessionPayload(app, ctx);
  });

  router.post('/api/login', { auth: false }, async (ctx) => {
    const b = await ctx.json();
    const username = str(b.username, 60), password = typeof b.password === 'string' ? b.password : '';
    const fail = (msg, extra) => { throw new HttpError(401, msg || 'Benutzername oder Passwort falsch.', extra); };
    const u = username ? db.get('SELECT * FROM users WHERE username = ?', username) : null;
    if (!u) { await dummyVerify(password); writeAudit(db, { user_name: username.slice(0, 60), area: 'Anmeldung', action: 'Anmeldung fehlgeschlagen (unbekannter Benutzer)', result: 'verweigert' }); return fail(); }
    if (u.locked_until && Date.parse(u.locked_until) > Date.now()) {
      const min = Math.ceil((Date.parse(u.locked_until) - Date.now()) / 60000);
      writeAudit(db, { user_id: u.id, user_name: u.display_name, role: u.role, area: 'Anmeldung', action: 'Anmeldung während Sperre', result: 'verweigert' });
      throw new HttpError(429, `Zu viele Fehlversuche. Das Konto ist für ${min} Minute(n) gesperrt.`);
    }
    const ok = await verifyPassword(password, u.pw_hash);
    if (!ok) {
      const n = u.failed_logins + 1;
      const lock = n >= config.maxLoginFailures ? new Date(Date.now() + config.lockMinutes * 60000).toISOString() : null;
      db.run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', lock ? 0 : n, lock, u.id);
      writeAudit(db, { user_id: u.id, user_name: u.display_name, role: u.role, area: 'Anmeldung', action: lock ? 'Konto nach Fehlversuchen gesperrt' : 'Anmeldung fehlgeschlagen', result: 'verweigert' });
      return fail();
    }
    if (!u.active) {
      writeAudit(db, { user_id: u.id, user_name: u.display_name, role: u.role, area: 'Anmeldung', action: 'Anmeldung eines deaktivierten Kontos', result: 'verweigert' });
      throw new HttpError(403, 'Dieses Konto ist deaktiviert. Bitte an die Systemadministration wenden.');
    }
    db.run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', nowIso(), u.id);
    // alte Sitzung dieses Browsers beenden
    if (ctx.cookies.lsa_session) auth.destroySession(ctx);
    ctx.setCookies = [];
    auth.createSession(ctx, u.id);
    ctx.user = db.get('SELECT * FROM users WHERE id = ?', u.id);
    audit(db, ctx, { area: 'Anmeldung', action: 'Angemeldet' });
    return sessionPayload(app, ctx);
  });

  router.post('/api/logout', { auth: false }, (ctx) => {
    if (ctx.user) audit(db, ctx, { area: 'Anmeldung', action: 'Abgemeldet' });
    auth.destroySession(ctx);
    return { ok: true };
  });

  router.post('/api/password', async (ctx) => {
    const b = await ctx.json();
    const target = ctx.realUser ? ctx.realUser : ctx.user; // in der Testansicht ändert der Admin sein eigenes Passwort
    if (!(await verifyPassword(String(b.current || ''), target.pw_hash))) throw badRequest('Das aktuelle Passwort stimmt nicht.');
    const err = validatePassword(b.next, target.username);
    if (err) throw badRequest(err);
    if (b.next === b.current) throw badRequest('Das neue Passwort muss sich vom alten unterscheiden.');
    const hash = await hashPassword(b.next);
    db.run('UPDATE users SET pw_hash = ?, must_change_pw = 0, pw_changed_at = ?, updated_at = ? WHERE id = ?', hash, nowIso(), nowIso(), target.id);
    audit(db, ctx, { area: 'Anmeldung', action: 'Passwort geändert' });
    return { ok: true };
  });

  // ---- Testansicht: Administrator sieht die Oberfläche mit den Rechten einer anderen Person ----
  router.post('/api/impersonate', async (ctx) => {
    const adminUser = ctx.realUser || ctx.user;
    if (!getSetting(db, 'test_mode', true)) throw forbidden('Die Testansicht ist ausgeschaltet (Einstellungen → System).');
    const admin = db.get('SELECT * FROM users WHERE id = ?', adminUser.id);
    if (!effectivePerms(admin).features['users.manage']) throw forbidden();
    const b = await ctx.json();
    const target = db.get('SELECT * FROM users WHERE id = ?', Number(b.userId));
    if (!target || !target.active) throw notFound('Person nicht gefunden oder deaktiviert.');
    if (target.id === admin.id) throw badRequest('Das ist bereits Ihr eigenes Konto.');
    db.run('UPDATE sessions SET user_id = ?, acting_user_id = ? WHERE id = ?', target.id, admin.id, ctx.session.id);
    writeAudit(db, { user_id: target.id, user_name: target.display_name, role: target.role, real_user_name: admin.display_name, area: 'System', action: `Testansicht gestartet als ${target.display_name}` });
    return { ok: true };
  });
  router.post('/api/impersonate/stop', (ctx) => {
    if (!ctx.realUser) return { ok: true };
    db.run('UPDATE sessions SET user_id = ?, acting_user_id = NULL WHERE id = ?', ctx.realUser.id, ctx.session.id);
    writeAudit(db, { user_id: ctx.realUser.id, user_name: ctx.realUser.display_name, role: ctx.realUser.role, area: 'System', action: 'Testansicht beendet' });
    return { ok: true };
  });
}
