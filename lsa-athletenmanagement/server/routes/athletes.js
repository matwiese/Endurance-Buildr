// Athlet:innen-Akten: Stammdaten, Lebenszyklus, Betreuungsteam, Zugang, Einwilligungen
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import { audit, hashPassword } from '../auth.js';
import { getSetting, setSetting } from '../db.js';
import { ROLES, effectivePerms } from '../permissions.js';
import { accessFor, athleteDto, need, visibleAthletes } from '../access.js';
import { CONSENT_DEFAULTS, CONSENT_GIVEN_BY, CONSENT_STATUS, EXIT_CHECKLIST, LIFECYCLE, SEX, TEAM_FUNCTIONS, TEAM_FUNCTION_BY_ROLE } from '../catalog.js';
import { str, bool, isDate, todayStr, nowIso, randomPassword, slugUsername } from '../util.js';

export function nextAthleteId(db) {
  const prefix = getSetting(db, 'athlete_prefix', 'LSA');
  let seq = Number(getSetting(db, 'athlete_seq', 0)) + 1;
  // Falls Akten außerhalb des Zählers existieren (z. B. Import), Kollisionen überspringen
  while (db.get('SELECT 1 AS x FROM athletes WHERE id = ?', `${prefix}-${String(seq).padStart(4, '0')}`)) seq++;
  setSetting(db, 'athlete_seq', seq);
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export function seedConsents(db, athleteId, sex, by = '') {
  for (const c of CONSENT_DEFAULTS) {
    const status = c.key === 'cycle' && sex !== 'w' ? 'entfällt' : c.status;
    db.run(`INSERT OR IGNORE INTO consents(athlete_id, purpose_key, purpose, basis, voluntary, status, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?)`,
      athleteId, c.key, c.purpose, c.basis, c.voluntary ? 1 : 0, status, nowIso(), by);
  }
}

export function register(app) {
  const { router, db, config } = app;

  const teamOf = (ids) => {
    if (!ids.length) return new Map();
    const rows = db.all(`SELECT s.athlete_id, s.function, u.id AS user_id, u.display_name, u.role, u.active FROM athlete_staff s JOIN users u ON u.id = s.user_id
      WHERE s.athlete_id IN (${ids.map(() => '?').join(',')}) ORDER BY s.function, u.display_name`, ...ids);
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.athlete_id)) m.set(r.athlete_id, []);
      m.get(r.athlete_id).push({ userId: r.user_id, name: r.display_name, function: r.function, role: r.role, active: !!r.active });
    }
    return m;
  };
  const loginOf = (athleteId) => {
    const u = db.get('SELECT id, username, active, last_login_at, must_change_pw FROM users WHERE athlete_id = ? AND role = ?', athleteId, 'athlet');
    return u ? { userId: u.id, username: u.username, active: !!u.active, lastLoginAt: u.last_login_at, mustChangePw: !!u.must_change_pw } : null;
  };

  function readFields(b, existing) {
    const sports = getSetting(db, 'sports', []);
    const g = (k, def = '') => (b[k] !== undefined ? b[k] : def);
    const o = {};
    o.name = str(g('name', existing?.name), 100);
    if (!o.name) throw badRequest('Bitte einen Namen angeben.');
    o.born = str(g('born', existing?.born), 10);
    if (!isDate(o.born)) throw badRequest('Bitte ein gültiges Geburtsdatum angeben.');
    if (o.born > todayStr()) throw badRequest('Das Geburtsdatum liegt in der Zukunft.');
    if (o.born < '1940-01-01') throw badRequest('Das Geburtsdatum ist unplausibel.');
    o.sex = str(g('sex', existing?.sex ?? '–'), 2);
    if (!SEX.some(([k]) => k === o.sex)) throw badRequest('Ungültige Angabe beim Geschlecht.');
    o.sport = str(g('sport', existing?.sport), 60);
    if (!sports.includes(o.sport)) throw badRequest('Bitte eine Sportart aus der Liste wählen (Verwaltung unter System → Sportarten).');
    o.discipline = str(g('discipline', existing?.discipline), 100);
    o.group_name = str(g('group', existing?.group_name), 100);
    o.club = str(g('club', existing?.club), 100);
    o.federation = str(g('federation', existing?.federation), 60);
    o.kader = str(g('kader', existing?.kader), 100);
    o.school = str(g('school', existing?.school), 150);
    o.school_class = str(g('schoolClass', existing?.school_class), 30);
    o.edu_goal = str(g('eduGoal', existing?.edu_goal), 150);
    o.boarding = bool(g('boarding', existing?.boarding)) ? 1 : 0;
    o.guardian = str(g('guardian', existing?.guardian), 300);
    o.emergency = str(g('emergency', existing?.emergency), 300);
    o.entry_date = str(g('entryDate', existing?.entry_date || todayStr()), 10);
    if (!isDate(o.entry_date)) throw badRequest('Ungültiges Eintrittsdatum.');
    o.review_date = str(g('reviewDate', existing?.review_date), 10);
    if (o.review_date && !isDate(o.review_date)) throw badRequest('Ungültiger Überprüfungstermin.');
    return o;
  }

  // ---- Liste ----
  router.get('/api/athletes', (ctx) => {
    const rows = visibleAthletes(db, ctx.user);
    const team = teamOf(rows.map((a) => a.id));
    return { athletes: rows.map((a) => ({ ...athleteDto(a), team: team.get(a.id) || [] })) };
  });

  // ---- Neue Akte ----
  router.post('/api/athletes', { feature: 'athletes.create' }, async (ctx) => {
    const b = await ctx.json();
    const f = readFields(b, null);
    const now = nowIso();
    const id = db.tx(() => {
      const id = nextAthleteId(db);
      db.run(`INSERT INTO athletes(id, name, sex, born, sport, discipline, group_name, club, federation, kader, school, school_class, edu_goal, boarding, guardian, emergency, entry_date, review_date, status, created_at, created_by, updated_at, updated_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, f.name, f.sex, f.born, f.sport, f.discipline, f.group_name, f.club, f.federation, f.kader, f.school, f.school_class, f.edu_goal, f.boarding, f.guardian, f.emergency,
      f.entry_date, f.review_date || '', 'aktiv', now, ctx.user.display_name, now, ctx.user.display_name);
      seedConsents(db, id, f.sex, ctx.user.display_name);
      // Wer die Akte anlegt und Koordination ist, wird automatisch Teil des Betreuungsteams
      if (ctx.user.role === 'koordinator') db.run('INSERT OR IGNORE INTO athlete_staff(athlete_id, user_id, function) VALUES (?,?,?)', id, ctx.user.id, 'Koordination');
      return id;
    });
    audit(db, ctx, { athleteId: id, area: 'Stammdaten', action: 'Stammdatenblatt angelegt', detail: f.name });
    return { id };
  });

  // ---- Akte öffnen ----
  router.get('/api/athletes/:id', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const a = acc.athlete, perms = effectivePerms(ctx.user);
    const f = perms.features;
    const levels = acc.levels;
    const hasOverview = levels.overview !== 'none';
    if (!hasOverview) throw forbidden();
    const team = teamOf([a.id]).get(a.id) || [];
    const canEdit = levels.overview === 'full';
    return {
      athlete: athleteDto(a), team, levels,
      can: {
        edit: canEdit,
        lifecycle: canEdit && !!f['athletes.create'],
        team: !!f['team.assign'],
        login: !!f['athlete.login'],
        delete: !!f['athletes.create'] && levels.overview === 'full',
        export: !!f['export.athlete'],
      },
      login: f['athlete.login'] || f['users.manage'] ? loginOf(a.id) : null,
    };
  });

  // ---- Stammdaten ändern ----
  router.put('/api/athletes/:id', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'overview', ['full'], 'Stammdaten ändern');
    const a = acc.athlete;
    const b = await ctx.json();
    const f = readFields(b, a);
    const labels = { name: 'Name', born: 'Geburtsdatum', sex: 'Geschlecht', sport: 'Sportart', discipline: 'Disziplin', group_name: 'Trainingsgruppe', club: 'Verein', federation: 'Verband', kader: 'Kader', school: 'Schule', school_class: 'Klasse', edu_goal: 'Bildungsziel', boarding: 'Internat', guardian: 'Gesetzl. Vertretung', emergency: 'Notfallkontakt', entry_date: 'Eintritt', review_date: 'Überprüfungstermin' };
    const changed = Object.keys(labels).filter((k) => String(f[k] ?? '') !== String(a[k] ?? ''));
    db.run(`UPDATE athletes SET name=?, sex=?, born=?, sport=?, discipline=?, group_name=?, club=?, federation=?, kader=?, school=?, school_class=?, edu_goal=?, boarding=?, guardian=?, emergency=?, entry_date=?, review_date=?, updated_at=?, updated_by=? WHERE id=?`,
      f.name, f.sex, f.born, f.sport, f.discipline, f.group_name, f.club, f.federation, f.kader, f.school, f.school_class, f.edu_goal, f.boarding, f.guardian, f.emergency, f.entry_date, f.review_date, nowIso(), ctx.user.display_name, a.id);
    if (a.sex !== f.sex) {
      // Zyklus-Einwilligung ist nur für Athletinnen vorgesehen
      if (f.sex === 'w') db.run("UPDATE consents SET status = 'nicht erteilt', updated_at = ? WHERE athlete_id = ? AND purpose_key = 'cycle' AND status = 'entfällt'", nowIso(), a.id);
      else db.run("UPDATE consents SET status = 'entfällt', updated_at = ? WHERE athlete_id = ? AND purpose_key = 'cycle'", nowIso(), a.id);
    }
    if (changed.length) audit(db, ctx, { athleteId: a.id, area: 'Stammdaten', action: 'Stammdaten geändert', detail: changed.map((k) => labels[k]).join(', ') });
    return { ok: true };
  });

  // ---- Lebenszyklus ----
  router.post('/api/athletes/:id/lifecycle', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'overview', ['full'], 'Status ändern');
    if (!ctx.hasFeature('athletes.create')) throw forbidden();
    const b = await ctx.json();
    const status = str(b.status, 20);
    if (!LIFECYCLE.includes(status)) throw badRequest('Unbekannter Status.');
    const a = acc.athlete;
    if (a.status === status) return { ok: true };
    db.tx(() => {
      db.run('UPDATE athletes SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?', status, nowIso(), ctx.user.display_name, a.id);
      if (status === 'ausgetreten') {
        const lg = db.get("SELECT id FROM users WHERE athlete_id = ? AND role = 'athlet'", a.id);
        const chk = EXIT_CHECKLIST.map(() => false);
        if (lg) { db.run('UPDATE users SET active = 0, updated_at = ? WHERE id = ?', nowIso(), lg.id); db.run('DELETE FROM sessions WHERE user_id = ?', lg.id); }
        chk[0] = true; // eigener Zugang ist beendet; Zugriff der Fachpersonen endet, da Austritte nur noch die Koordination sieht
        db.run('UPDATE athletes SET exit_checklist = ? WHERE id = ?', JSON.stringify(chk), a.id);
      }
    });
    audit(db, ctx, { athleteId: a.id, area: 'Stammdaten', action: `Status auf „${status}“ gesetzt`, detail: `vorher: ${a.status}` });
    return { ok: true };
  });

  router.post('/api/athletes/:id/exit-check', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'overview', ['full'], 'Austrittscheckliste');
    if (!ctx.hasFeature('athletes.create')) throw forbidden();
    const a = acc.athlete;
    if (a.status !== 'ausgetreten') throw badRequest('Die Checkliste gibt es nur für ausgetretene Athlet:innen.');
    const b = await ctx.json();
    const i = Number(b.index);
    if (!Number.isInteger(i) || i < 0 || i >= EXIT_CHECKLIST.length) throw badRequest('Ungültiger Punkt.');
    const chk = athleteDto(a).exitChecklist;
    while (chk.length < EXIT_CHECKLIST.length) chk.push(false);
    chk[i] = bool(b.checked);
    db.run('UPDATE athletes SET exit_checklist = ?, updated_at = ? WHERE id = ?', JSON.stringify(chk), nowIso(), a.id);
    audit(db, ctx, { athleteId: a.id, area: 'Stammdaten', action: `Austritt: „${EXIT_CHECKLIST[i]}“ ${chk[i] ? 'erledigt' : 'zurückgenommen'}` });
    return { exitChecklist: chk };
  });

  // ---- Betreuungsteam ----
  router.get('/api/directory', { feature: 'team.assign' }, () => {
    const rows = db.all("SELECT id, display_name, role, function_title, scope_all, scope_sports FROM users WHERE active = 1 AND role != 'athlet' ORDER BY display_name COLLATE NOCASE");
    return { people: rows.map((u) => ({ id: u.id, name: u.display_name, role: u.role, roleLabel: ROLES[u.role]?.label, functionTitle: u.function_title, defaultFunction: TEAM_FUNCTION_BY_ROLE[u.role] || 'Sonstige' })) };
  });

  router.put('/api/athletes/:id/team', { feature: 'team.assign' }, async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'overview', ['read', 'full'], 'Team ändern');
    const b = await ctx.json();
    if (!Array.isArray(b.team)) throw badRequest('Ungültige Angaben.');
    const wanted = [];
    for (const t of b.team) {
      const userId = Number(t.userId), fn = str(t.function, 40);
      const u = db.get("SELECT id, display_name FROM users WHERE id = ? AND active = 1 AND role != 'athlet'", userId);
      if (!u) throw badRequest('Eine ausgewählte Person gibt es nicht oder sie ist deaktiviert.');
      if (!TEAM_FUNCTIONS.includes(fn)) throw badRequest('Unbekannte Funktion im Team.');
      if (!wanted.some((w) => w.userId === userId && w.function === fn)) wanted.push({ userId, function: fn, name: u.display_name });
    }
    const before = db.all('SELECT s.user_id, s.function, u.display_name FROM athlete_staff s JOIN users u ON u.id = s.user_id WHERE s.athlete_id = ?', acc.athlete.id);
    db.tx(() => {
      db.run('DELETE FROM athlete_staff WHERE athlete_id = ?', acc.athlete.id);
      for (const w of wanted) db.run('INSERT INTO athlete_staff(athlete_id, user_id, function) VALUES (?,?,?)', acc.athlete.id, w.userId, w.function);
    });
    const key = (x) => `${x.user_id ?? x.userId}|${x.function}`;
    const bs = new Set(before.map(key)), ws = new Set(wanted.map(key));
    const added = wanted.filter((w) => !bs.has(key(w))).map((w) => `${w.name} (${w.function})`);
    const removed = before.filter((x) => !ws.has(key(x))).map((x) => `${x.display_name} (${x.function})`);
    if (added.length || removed.length) audit(db, ctx, { athleteId: acc.athlete.id, area: 'Zugriffsrechte', action: 'Betreuungsteam geändert', detail: [added.length ? 'neu: ' + added.join(', ') : '', removed.length ? 'entfernt: ' + removed.join(', ') : ''].filter(Boolean).join(' | ') });
    return { team: teamOf([acc.athlete.id]).get(acc.athlete.id) || [] };
  });

  // ---- Zugang der Athlet:in ----
  router.post('/api/athletes/:id/login', { feature: 'athlete.login' }, async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'overview', ['read', 'full'], 'Zugang anlegen');
    const a = acc.athlete;
    if (loginOf(a.id)) throw conflict('Diese Athlet:in hat bereits einen Zugang.');
    const b = await ctx.json();
    let username = str(b.username, 40).toLowerCase() || slugUsername(a.name);
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw badRequest('Benutzername: 3–40 Zeichen, nur Kleinbuchstaben, Ziffern, Punkt, Unterstrich, Bindestrich.');
    if (db.get('SELECT 1 AS x FROM users WHERE username = ?', username)) throw conflict(`Der Benutzername „${username}“ ist schon vergeben. Bitte einen anderen wählen.`);
    const password = randomPassword(12);
    const now = nowIso();
    const id = db.run(`INSERT INTO users(username, display_name, role, pw_hash, must_change_pw, active, athlete_id, created_at, created_by, updated_at, pw_changed_at, function_title)
      VALUES (?,?,?,?,1,1,?,?,?,?,?,?)`, username, a.name, 'athlet', await hashPassword(password), a.id, now, ctx.user.display_name, now, now, 'Athlet:in').lastInsertRowid;
    audit(db, ctx, { athleteId: a.id, area: 'Zugriffsrechte', action: 'Zugang für Athlet:in angelegt', detail: `Benutzername ${username}` });
    return { login: loginOf(a.id), temporaryPassword: password, userId: id };
  });

  router.post('/api/athletes/:id/login/reset', { feature: 'athlete.login' }, async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'overview', ['read', 'full'], 'Zugang zurücksetzen');
    const lg = loginOf(acc.athlete.id);
    if (!lg) throw notFound('Kein Zugang vorhanden.');
    const password = randomPassword(12);
    db.run('UPDATE users SET pw_hash = ?, must_change_pw = 1, failed_logins = 0, locked_until = NULL, pw_changed_at = ?, updated_at = ?, active = 1 WHERE id = ?', await hashPassword(password), nowIso(), nowIso(), lg.userId);
    db.run('DELETE FROM sessions WHERE user_id = ?', lg.userId);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Zugriffsrechte', action: 'Passwort der Athlet:in zurückgesetzt' });
    return { login: loginOf(acc.athlete.id), temporaryPassword: password };
  });

  router.post('/api/athletes/:id/login/active', { feature: 'athlete.login' }, async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'overview', ['read', 'full'], 'Zugang sperren');
    const lg = loginOf(acc.athlete.id);
    if (!lg) throw notFound('Kein Zugang vorhanden.');
    const b = await ctx.json();
    const active = bool(b.active);
    db.run('UPDATE users SET active = ?, updated_at = ? WHERE id = ?', active ? 1 : 0, nowIso(), lg.userId);
    if (!active) db.run('DELETE FROM sessions WHERE user_id = ?', lg.userId);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Zugriffsrechte', action: `Zugang der Athlet:in ${active ? 'aktiviert' : 'deaktiviert'}` });
    return { login: loginOf(acc.athlete.id) };
  });

  // ---- Akte löschen (Löschung nach Frist / auf Verlangen) ----
  router.delete('/api/athletes/:id', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'overview', ['full'], 'Akte löschen');
    if (!ctx.hasFeature('athletes.create')) throw forbidden();
    const b = await ctx.json();
    const a = acc.athlete;
    if (b.confirm !== a.id) throw badRequest(`Zur Bestätigung bitte die Athleten-ID „${a.id}“ eingeben.`);
    db.tx(() => {
      db.run("DELETE FROM users WHERE athlete_id = ? AND role = 'athlet'", a.id);
      db.run('DELETE FROM athletes WHERE id = ?', a.id);
    });
    try { fs.rmSync(path.join(config.docsDir, a.id), { recursive: true, force: true }); } catch { /* Ordner evtl. nicht vorhanden */ }
    audit(db, ctx, { athleteId: a.id, area: 'Stammdaten', action: 'Akte endgültig gelöscht', detail: `${a.name} (${a.sport}), Daten und Dokumente entfernt` });
    return { ok: true };
  });

  // ---- Einwilligungen & Zugriffsprotokoll der Akte ----
  const consentDto = (c) => ({ key: c.purpose_key, purpose: c.purpose, basis: c.basis, voluntary: !!c.voluntary, status: c.status, givenBy: c.given_by, note: c.note, updatedAt: c.updated_at, updatedBy: c.updated_by });

  router.get('/api/athletes/:id/privacy', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const lvl = need(db, ctx, acc, 'privacy', ['full', 'own'], 'Einwilligungen ansehen');
    const consents = db.all('SELECT * FROM consents WHERE athlete_id = ? ORDER BY id', acc.athlete.id).map(consentDto);
    const log = db.all('SELECT ts, role, area, action, result FROM audit WHERE athlete_id = ? ORDER BY id DESC LIMIT 40', acc.athlete.id);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Datenschutz', action: 'Einwilligungen und Zugriffsprotokoll angesehen', result: lvl === 'own' ? 'eigene Daten' : 'vollständig', dedupe: true });
    const minor = (() => { const [y, m, d] = acc.athlete.born.split('-').map(Number); const t = new Date(); let age = t.getFullYear() - y; if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) age--; return age < 18; })();
    return { consents, log, level: lvl, minor, statuses: CONSENT_STATUS, givenBy: CONSENT_GIVEN_BY };
  });

  router.put('/api/athletes/:id/consents/:key', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const lvl = need(db, ctx, acc, 'privacy', ['full', 'own'], 'Einwilligung ändern');
    const c = db.get('SELECT * FROM consents WHERE athlete_id = ? AND purpose_key = ?', acc.athlete.id, ctx.params.key);
    if (!c) throw notFound('Zweck nicht gefunden.');
    const b = await ctx.json();
    const status = str(b.status, 20);
    if (!CONSENT_STATUS.includes(status)) throw badRequest('Ungültiger Status.');
    if (c.status === 'entfällt' && status !== 'entfällt') throw badRequest('Dieser Zweck ist für diese Athlet:in nicht vorgesehen.');
    let givenBy = str(b.givenBy, 60), note = str(b.note, 300);
    if (lvl === 'own') {
      if (!c.voluntary) throw forbidden('Dieser Zweck beruht nicht auf einer Einwilligung.');
      if (!['erteilt', 'widerrufen'].includes(status)) throw badRequest('Erlaubt sind „erteilt“ oder „widerrufen“.');
      givenBy = 'Athlet:in'; note = '';
    } else {
      if (givenBy && !CONSENT_GIVEN_BY.includes(givenBy)) throw badRequest('Ungültige Angabe, wer eingewilligt hat.');
      if (c.voluntary && status === 'erteilt' && !givenBy) throw badRequest('Bitte angeben, wer die Einwilligung erteilt hat.');
    }
    db.run('UPDATE consents SET status = ?, given_by = ?, note = ?, updated_at = ?, updated_by = ? WHERE id = ?', status, givenBy, note, nowIso(), ctx.user.display_name, c.id);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Datenschutz', action: `Einwilligung „${c.purpose}“: ${status}`, detail: givenBy ? `durch ${givenBy}` : '' });
    return { consent: consentDto(db.get('SELECT * FROM consents WHERE id = ?', c.id)) };
  });
}
