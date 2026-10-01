// Anmeldung, Passwörter (scrypt), Sitzungen (Cookie) und Zugriffsprotokoll.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { sha256, randomToken, nowIso } from './util.js';
import { effectivePerms, scopeOf } from './permissions.js';
import { HttpError } from './http.js';

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;
export const COOKIE = 'lsa_session';

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}
export async function verifyPassword(pw, stored) {
  try {
    const [alg, n, r, p, salt, hash] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const got = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +r, p: +p });
    return crypto.timingSafeEqual(got, expected);
  } catch { return false; }
}
// Dummy-Hash, damit unbekannte Benutzernamen gleich lange dauern wie bekannte.
let DUMMY = null;
export async function dummyVerify(pw) { DUMMY ??= await hashPassword('dummy-password'); await verifyPassword(pw, DUMMY); }

export function validatePassword(pw, username = '') {
  if (typeof pw !== 'string') return 'Passwort fehlt.';
  if (pw.length < 10) return 'Das Passwort muss mindestens 10 Zeichen lang sein.';
  if (pw.length > 200) return 'Das Passwort ist zu lang.';
  if (/^\d+$/.test(pw)) return 'Das Passwort darf nicht nur aus Ziffern bestehen.';
  if (username && pw.toLowerCase().includes(String(username).toLowerCase()) && username.length >= 3) return 'Das Passwort darf den Benutzernamen nicht enthalten.';
  return null;
}

// ---- Protokoll ----
export function audit(db, ctx, e) {
  const u = ctx?.user, real = ctx?.realUser;
  writeAudit(db, {
    user_id: u?.id ?? null, user_name: u?.display_name ?? e.userName ?? '', role: u?.role ?? '',
    real_user_name: real ? real.display_name : '', ...e,
  });
}
export function writeAudit(db, e) {
  const { athleteId = null, area = '', action, result = 'erlaubt', detail = '', dedupe = false } = e;
  if (dedupe) {
    const last = db.get(
      'SELECT ts FROM audit WHERE user_id IS ? AND athlete_id IS ? AND area = ? AND action = ? AND result = ? ORDER BY id DESC LIMIT 1',
      e.user_id ?? null, athleteId, area, action, result);
    if (last && Date.now() - Date.parse(last.ts) < 60000) return;
  }
  db.run(
    'INSERT INTO audit(ts, user_id, user_name, role, real_user_name, athlete_id, area, action, result, detail) VALUES (?,?,?,?,?,?,?,?,?,?)',
    nowIso(), e.user_id ?? null, e.user_name ?? '', e.role ?? '', e.real_user_name ?? '', athleteId, area, action, result, detail);
}

export function createAuth({ db, config }) {
  const idleMs = config.sessionIdleMinutes * 60000;
  const maxMs = config.sessionMaxHours * 3600000;

  function cookieHeader(token, maxAgeSec) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`;
  }

  function createSession(ctx, userId) {
    const token = randomToken();
    const now = Date.now();
    db.run('INSERT INTO sessions(id, user_id, created_at, last_seen, expires_at) VALUES (?,?,?,?,?)',
      sha256(token), userId, new Date(now).toISOString(), new Date(now).toISOString(), new Date(now + maxMs).toISOString());
    ctx.setCookies.push(cookieHeader(token, Math.floor(maxMs / 1000)));
  }
  function destroySession(ctx) {
    const token = ctx.cookies[COOKIE];
    if (token) db.run('DELETE FROM sessions WHERE id = ?', sha256(token));
    ctx.setCookies.push(cookieHeader('', 0));
  }

  // Wird bei jeder API-Anfrage aufgerufen: ordnet Cookie -> Sitzung -> Person zu.
  async function onRequestAuth(ctx) {
    ctx.hasFeature = () => false;
    ctx.deny = null;
    const token = ctx.cookies[COOKIE];
    if (!token) return;
    const s = db.get('SELECT * FROM sessions WHERE id = ?', sha256(token));
    if (!s) return;
    const now = Date.now();
    if (Date.parse(s.expires_at) < now || now - Date.parse(s.last_seen) > idleMs) {
      db.run('DELETE FROM sessions WHERE id = ?', s.id);
      return;
    }
    const user = db.get('SELECT * FROM users WHERE id = ?', s.user_id);
    if (!user || !user.active) { db.run('DELETE FROM sessions WHERE id = ?', s.id); return; }
    let real = null;
    if (s.acting_user_id) {
      real = db.get('SELECT * FROM users WHERE id = ?', s.acting_user_id);
      if (!real || !real.active) { db.run('DELETE FROM sessions WHERE id = ?', s.id); return; }
    }
    if (now - Date.parse(s.last_seen) > 30000) db.run('UPDATE sessions SET last_seen = ? WHERE id = ?', new Date(now).toISOString(), s.id);
    ctx.session = s;
    ctx.user = user;
    ctx.realUser = real;
    ctx.perms = effectivePerms(user);
    ctx.scope = scopeOf(user);
    ctx.hasFeature = (k) => !!ctx.perms.features[k];
    ctx.deny = (what) => audit(db, ctx, { area: 'System', action: `Funktion verweigert: ${what}`, result: 'verweigert' });
    // Muss-Passwort-ändern: alle Routen außer Sitzung/Passwort/Abmelden sperren
    if (user.must_change_pw && !real && !/^\/api\/(session|password|logout)$/.test(ctx.pathname)) {
      throw new HttpError(403, 'Bitte zuerst ein neues Passwort festlegen.', { mustChangePassword: true });
    }
  }

  return { onRequestAuth, createSession, destroySession, cookieHeader };
}
