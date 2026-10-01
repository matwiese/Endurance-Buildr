// Personen (Benutzer) anlegen, Rollen und Einzelrechte vergeben.
import { badRequest, notFound, conflict } from '../http.js';
import { hashPassword, validatePassword, audit } from '../auth.js';
import { getSetting } from '../db.js';
import { ROLES, ROLE_KEYS, ROLE_DEFAULTS, sanitizeOverrides, parseOverrides, effectivePerms, scopeOf } from '../permissions.js';
import { str, bool, nowIso, randomPassword } from '../util.js';
import { userDto } from './auth.js';

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;

export function register(app) {
  const { router, db } = app;

  function fullDto(u) {
    const d = userDto(u);
    return {
      ...d,
      notes: u.notes, lastLoginAt: u.last_login_at, createdAt: u.created_at, createdBy: u.created_by, pwChangedAt: u.pw_changed_at,
      locked: !!(u.locked_until && Date.parse(u.locked_until) > Date.now()),
      overrides: parseOverrides(u.overrides),
      assignedCount: tableExists('athlete_staff') ? db.get('SELECT COUNT(DISTINCT athlete_id) AS n FROM athlete_staff WHERE user_id = ?', u.id).n : 0,
    };
  }
  function tableExists(name) { return !!db.get("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name = ?", name); }

  function activeAdmins(exceptId) {
    return db.all('SELECT * FROM users WHERE active = 1 AND id != ?', exceptId ?? -1)
      .filter((u) => effectivePerms(u).features['users.manage']).length;
  }

  // Gemeinsame Prüfung/Normalisierung der Eingaben beim Anlegen und Ändern
  function readFields(b, existing) {
    const sports = getSetting(db, 'sports', []);
    const out = {};
    out.display_name = str(b.displayName ?? existing?.display_name, 100);
    if (!out.display_name) throw badRequest('Bitte einen Namen angeben.');
    out.email = str(b.email ?? existing?.email, 200);
    if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw badRequest('Die E-Mail-Adresse ist ungültig.');
    out.phone = str(b.phone ?? existing?.phone, 50);
    out.function_title = str(b.functionTitle ?? existing?.function_title, 100);
    out.notes = str(b.notes ?? existing?.notes, 1000);
    out.role = b.role ?? existing?.role;
    if (!ROLE_KEYS.includes(out.role)) throw badRequest('Unbekannte Rolle.');
    const sc = b.scope || (existing ? scopeOf(existing) : { all: ROLE_DEFAULTS[out.role].scope === 'all', sports: [] });
    out.scope_all = out.role === 'athlet' ? 0 : bool(sc.all) ? 1 : 0;
    const sel = (Array.isArray(sc.sports) ? sc.sports : []).map(String);
    for (const s of sel) if (!sports.includes(s)) throw badRequest(`Unbekannte Sportart: ${s}`);
    out.scope_sports = JSON.stringify(out.role === 'athlet' ? [] : [...new Set(sel)]);
    out.overrides = JSON.stringify(sanitizeOverrides(out.role, b.overrides ?? (existing ? parseOverrides(existing.overrides) : {})));
    return out;
  }

  router.get('/api/users', { feature: 'users.manage' }, () => {
    const rows = db.all('SELECT * FROM users ORDER BY active DESC, display_name COLLATE NOCASE');
    return { users: rows.map(fullDto) };
  });

  router.get('/api/users/:id', { feature: 'users.manage' }, (ctx) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(ctx.params.id));
    if (!u) throw notFound('Person nicht gefunden.');
    return { user: fullDto(u) };
  });

  router.post('/api/users', { feature: 'users.manage' }, async (ctx) => {
    const b = await ctx.json();
    const username = str(b.username, 40).toLowerCase();
    if (!USERNAME_RE.test(username)) throw badRequest('Benutzername: 3–40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Unterstrich, Bindestrich.');
    if (db.get('SELECT 1 AS x FROM users WHERE username = ?', username)) throw conflict('Dieser Benutzername ist schon vergeben.');
    const f = readFields(b, null);
    if (f.role === 'athlet') throw badRequest('Zugänge für Athlet:innen werden in der jeweiligen Akte angelegt (Betreuung → Zugang).');
    let password = typeof b.password === 'string' && b.password ? b.password : null;
    let generated = false;
    if (password) { const e = validatePassword(password, username); if (e) throw badRequest(e); }
    else { password = randomPassword(12); generated = true; }
    const hash = await hashPassword(password);
    const now = nowIso();
    const id = db.run(
      `INSERT INTO users(username, display_name, email, phone, function_title, role, pw_hash, must_change_pw, active, scope_all, scope_sports, overrides, notes, created_at, created_by, updated_at, pw_changed_at)
       VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)`,
      username, f.display_name, f.email, f.phone, f.function_title, f.role, hash, b.mustChangePw === false ? 0 : 1,
      f.scope_all, f.scope_sports, f.overrides, f.notes, now, ctx.user.display_name, now, now).lastInsertRowid;
    audit(db, ctx, { area: 'Zugriffsrechte', action: `Person angelegt: ${f.display_name} (${ROLES[f.role].label})`, detail: `Benutzername ${username}` });
    return { user: fullDto(db.get('SELECT * FROM users WHERE id = ?', id)), temporaryPassword: generated ? password : null };
  });

  router.put('/api/users/:id', { feature: 'users.manage' }, async (ctx) => {
    const id = Number(ctx.params.id);
    const u = db.get('SELECT * FROM users WHERE id = ?', id);
    if (!u) throw notFound('Person nicht gefunden.');
    const b = await ctx.json();
    const f = readFields(b, u);
    if (u.role === 'athlet' && f.role !== 'athlet') throw badRequest('Die Rolle eines Athlet:innen-Zugangs kann nicht geändert werden.');
    if (u.role !== 'athlet' && f.role === 'athlet') throw badRequest('Die Rolle „Athlet:in“ wird nur über die Akte vergeben.');
    // letzte Administration schützen
    const after = { ...u, ...f };
    if (u.active && effectivePerms(u).features['users.manage'] && !effectivePerms(after).features['users.manage'] && activeAdmins(u.id) === 0)
      throw badRequest('Das ist die letzte aktive Person mit dem Recht „Personen & Rechte verwalten“. Bitte zuerst eine weitere Person dafür berechtigen.');
    const before = { role: u.role, scope: scopeOf(u), ov: parseOverrides(u.overrides) };
    db.run(
      `UPDATE users SET display_name=?, email=?, phone=?, function_title=?, notes=?, role=?, scope_all=?, scope_sports=?, overrides=?, updated_at=? WHERE id=?`,
      f.display_name, f.email, f.phone, f.function_title, f.notes, f.role, f.scope_all, f.scope_sports, f.overrides, nowIso(), id);
    const changes = [];
    if (before.role !== f.role) changes.push(`Rolle ${ROLES[before.role].label} → ${ROLES[f.role].label}`);
    if (JSON.stringify(before.scope) !== JSON.stringify(scopeOf({ ...u, ...f }))) changes.push('Athletenbereich geändert');
    if (JSON.stringify(before.ov) !== f.overrides && JSON.stringify(before.ov) !== JSON.stringify(parseOverrides(f.overrides))) changes.push('Einzelrechte geändert');
    audit(db, ctx, { area: 'Zugriffsrechte', action: `Person geändert: ${f.display_name}`, detail: changes.join('; ') });
    return { user: fullDto(db.get('SELECT * FROM users WHERE id = ?', id)) };
  });

  router.post('/api/users/:id/reset-password', { feature: 'users.manage' }, async (ctx) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(ctx.params.id));
    if (!u) throw notFound('Person nicht gefunden.');
    const b = await ctx.json();
    let password = typeof b.password === 'string' && b.password ? b.password : null;
    let generated = false;
    if (password) { const e = validatePassword(password, u.username); if (e) throw badRequest(e); }
    else { password = randomPassword(12); generated = true; }
    db.run('UPDATE users SET pw_hash = ?, must_change_pw = 1, failed_logins = 0, locked_until = NULL, pw_changed_at = ?, updated_at = ? WHERE id = ?',
      await hashPassword(password), nowIso(), nowIso(), u.id);
    db.run('DELETE FROM sessions WHERE user_id = ? AND acting_user_id IS NULL', u.id); // bestehende Anmeldungen beenden
    audit(db, ctx, { area: 'Zugriffsrechte', action: `Passwort zurückgesetzt: ${u.display_name}` });
    return { temporaryPassword: generated ? password : null, ok: true };
  });

  router.post('/api/users/:id/active', { feature: 'users.manage' }, async (ctx) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(ctx.params.id));
    if (!u) throw notFound('Person nicht gefunden.');
    const b = await ctx.json();
    const active = bool(b.active);
    if (!active) {
      if (u.id === (ctx.realUser || ctx.user).id) throw badRequest('Das eigene Konto kann nicht deaktiviert werden.');
      if (u.active && effectivePerms(u).features['users.manage'] && activeAdmins(u.id) === 0) throw badRequest('Das ist die letzte aktive Administration.');
    }
    db.run('UPDATE users SET active = ?, updated_at = ? WHERE id = ?', active ? 1 : 0, nowIso(), u.id);
    if (!active) db.run('DELETE FROM sessions WHERE user_id = ? OR acting_user_id = ?', u.id, u.id);
    audit(db, ctx, { area: 'Zugriffsrechte', action: `${active ? 'Konto aktiviert' : 'Konto deaktiviert (Zugriff beendet)'}: ${u.display_name}` });
    return { user: fullDto(db.get('SELECT * FROM users WHERE id = ?', u.id)) };
  });

  router.post('/api/users/:id/unlock', { feature: 'users.manage' }, (ctx) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(ctx.params.id));
    if (!u) throw notFound('Person nicht gefunden.');
    db.run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', u.id);
    audit(db, ctx, { area: 'Zugriffsrechte', action: `Sperre aufgehoben: ${u.display_name}` });
    return { ok: true };
  });
}
