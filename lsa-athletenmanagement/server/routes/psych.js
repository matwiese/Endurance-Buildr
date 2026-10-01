// Geschützter Beratungsbereich (Sportpsychologie) und Schule/Dual Career
import { badRequest, forbidden, notFound } from '../http.js';
import { audit } from '../auth.js';
import { accessFor, need, visibleWithLevels } from '../access.js';
import { SCHOOL_TRENDS } from '../catalog.js';
import { evaluateAthlete } from '../alerts.js';
import { addDays, dayDiff, isDate, nowIso, str, todayStr } from '../util.js';

export const hintDto = (h) => ({ id: h.id, aid: h.athlete_id, date: h.date, text: h.text, by: h.author });

export function examConflicts(db, athleteId, sport, today = todayStr()) {
  const exams = db.all('SELECT * FROM exams WHERE athlete_id = ? AND date >= ? ORDER BY date', athleteId, today);
  const events = db.all("SELECT * FROM events WHERE date >= ? AND (sport = '' OR sport = ?) AND type != 'Schule' ORDER BY date", today, sport);
  const out = [];
  for (const x of exams) for (const e of events) if (Math.abs(dayDiff(e.date) - dayDiff(x.date)) <= 2) out.push({ exam: { id: x.id, date: x.date, subject: x.subject }, event: { date: e.date, title: e.title, type: e.type } });
  return out;
}

export function register(app) {
  const { router, db } = app;

  // ------------------------------------------------------------------ Psychologie
  router.get('/api/athletes/:id/psych', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const lvl = need(db, ctx, acc, 'psych', ['released', 'own', 'full'], 'Psychologie-Reiter öffnen');
    const a = acc.athlete;
    const out = { level: lvl, released: db.all('SELECT * FROM released_hints WHERE athlete_id = ? ORDER BY date DESC, id DESC', a.id).map(hintDto) };
    if (lvl === 'full') out.notes = db.all('SELECT id, date, text, author FROM psych_notes WHERE athlete_id = ? ORDER BY date DESC, id DESC', a.id);
    if (lvl === 'own') out.openRequest = !!db.get("SELECT 1 AS x FROM contact_requests WHERE athlete_id = ? AND status = 'offen'", a.id);
    audit(db, ctx, { athleteId: a.id, area: 'Psychologie', action: lvl === 'full' ? 'Geschützten Bereich geöffnet' : 'Reiter geöffnet', result: { released: 'nur freigegebene Hinweise', full: 'vollständig', own: 'eigene Daten' }[lvl], dedupe: true });
    return out;
  });

  router.post('/api/athletes/:id/psych/notes', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'psych', ['full'], 'Notiz anlegen');
    const text = str((await ctx.json()).text, 5000);
    if (!text) throw badRequest('Bitte einen Text eingeben.');
    db.run('INSERT INTO psych_notes(athlete_id, date, text, author, created_at) VALUES (?,?,?,?,?)', acc.athlete.id, todayStr(), text, ctx.user.display_name, nowIso());
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Psychologie', action: 'Notiz angelegt' });
    return { ok: true };
  });
  router.delete('/api/psych/notes/:id', (ctx) => {
    const n = db.get('SELECT * FROM psych_notes WHERE id = ?', Number(ctx.params.id));
    if (!n) throw notFound('Notiz nicht gefunden.');
    const acc = accessFor(db, ctx, n.athlete_id);
    need(db, ctx, acc, 'psych', ['full'], 'Notiz löschen');
    db.run('DELETE FROM psych_notes WHERE id = ?', n.id);
    audit(db, ctx, { athleteId: n.athlete_id, area: 'Psychologie', action: 'Notiz gelöscht' });
    return { ok: true };
  });

  // Handlungshinweis: verlässt den geschützten Bereich nur mit Zustimmung der Athlet:in, ohne Diagnose und Gesprächsinhalt
  router.post('/api/athletes/:id/psych/hints', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'psych', ['full'], 'Hinweis freigeben');
    const b = await ctx.json();
    const text = str(b.text, 500);
    if (!text) throw badRequest('Bitte den Hinweis formulieren (ohne Diagnose, ohne Gesprächsinhalt).');
    if (b.consent !== true) throw badRequest('Ohne Zustimmung der Athlet:in darf nichts weitergegeben werden.');
    db.run('INSERT INTO released_hints(athlete_id, date, text, author, created_at) VALUES (?,?,?,?,?)', acc.athlete.id, todayStr(), text, ctx.user.display_name, nowIso());
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Psychologie', action: 'Handlungshinweis freigegeben', result: 'mit Einwilligung' });
    return { ok: true };
  });
  router.delete('/api/psych/hints/:id', (ctx) => {
    const h = db.get('SELECT * FROM released_hints WHERE id = ?', Number(ctx.params.id));
    if (!h) throw notFound('Hinweis nicht gefunden.');
    const acc = accessFor(db, ctx, h.athlete_id);
    need(db, ctx, acc, 'psych', ['full'], 'Hinweis zurückziehen');
    db.run('DELETE FROM released_hints WHERE id = ?', h.id);
    audit(db, ctx, { athleteId: h.athlete_id, area: 'Psychologie', action: 'Handlungshinweis zurückgezogen' });
    return { ok: true };
  });

  // Vertrauliche Gesprächsanfrage der Athlet:in – geht nur an die Sportpsychologie
  router.post('/api/athletes/:id/contact-request', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'psych', ['own'], 'Gesprächsanfrage');
    if (!db.get("SELECT 1 AS x FROM contact_requests WHERE athlete_id = ? AND status = 'offen'", acc.athlete.id)) {
      db.run('INSERT INTO contact_requests(athlete_id, date, created_at) VALUES (?,?,?)', acc.athlete.id, todayStr(), nowIso());
    }
    evaluateAthlete(db, acc.athlete.id);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Psychologie', action: 'Vertrauliche Gesprächsanfrage gestellt' });
    return { ok: true };
  });

  // Übersicht für die Sportpsychologie (Cockpit)
  router.get('/api/psych/overview', (ctx) => {
    const vis = visibleWithLevels(db, ctx.user).filter((v) => v.levels.psych === 'full');
    if (!vis.length) throw forbidden();
    const names = new Map(vis.map((v) => [v.athlete.id, v.athlete.name]));
    const ids = [...names.keys()];
    const ph = ids.map(() => '?').join(',');
    const requests = db.all(`SELECT * FROM contact_requests WHERE athlete_id IN (${ph}) ORDER BY status DESC, id DESC LIMIT 100`, ...ids).map((r) => ({ id: r.id, aid: r.athlete_id, name: names.get(r.athlete_id), date: r.date, text: r.text, status: r.status }));
    audit(db, ctx, { area: 'Psychologie', action: 'Übersicht geöffnet', result: 'vollständig', dedupe: true });
    return { requests, hints: db.get(`SELECT COUNT(*) AS n FROM released_hints WHERE athlete_id IN (${ph})`, ...ids).n };
  });
  router.post('/api/psych/requests/:id/close', (ctx) => {
    const r = db.get('SELECT * FROM contact_requests WHERE id = ?', Number(ctx.params.id));
    if (!r) throw notFound('Anfrage nicht gefunden.');
    const acc = accessFor(db, ctx, r.athlete_id);
    need(db, ctx, acc, 'psych', ['full'], 'Anfrage bearbeiten');
    db.run("UPDATE contact_requests SET status = 'bearbeitet' WHERE id = ?", r.id);
    audit(db, ctx, { athleteId: r.athlete_id, area: 'Psychologie', action: 'Gesprächswunsch bearbeitet' });
    return { ok: true };
  });

  // ------------------------------------------------------------------ Schule
  router.get('/api/athletes/:id/school', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const lvl = need(db, ctx, acc, 'school', ['planning', 'full', 'own'], 'Schul-Reiter öffnen');
    const a = acc.athlete;
    const exams = db.all('SELECT id, date, subject FROM exams WHERE athlete_id = ? ORDER BY date', a.id);
    const events = db.all("SELECT date, title, type FROM events WHERE date >= ? AND (sport = '' OR sport = ?) ORDER BY date", todayStr(), a.sport);
    const out = { level: lvl, exams, events, conflicts: examConflicts(db, a.id, a.sport), canWrite: lvl === 'full' };
    if (lvl !== 'planning') {
      const s = db.get('SELECT * FROM school WHERE athlete_id = ?', a.id);
      out.status = { absences: s?.absences ?? 0, trend: s?.trend ?? '–' };
    }
    audit(db, ctx, { athleteId: a.id, area: 'Schule', action: lvl === 'planning' ? 'Planungsdaten angesehen' : 'Schulstatus angesehen', result: { planning: 'nur Termine', full: 'vollständig', own: 'eigene Daten' }[lvl], dedupe: true });
    return out;
  });
  router.put('/api/athletes/:id/school', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'school', ['full'], 'Schulstatus ändern');
    const b = await ctx.json();
    const absences = Number(b.absences), trend = str(b.trend, 10);
    if (!Number.isInteger(absences) || absences < 0 || absences > 1000) throw badRequest('Fehlstunden: ganze Zahl ab 0.');
    if (!SCHOOL_TRENDS.includes(trend)) throw badRequest('Ungültiger Notentrend.');
    db.run('INSERT INTO school(athlete_id, absences, trend, updated_at, updated_by) VALUES (?,?,?,?,?) ON CONFLICT(athlete_id) DO UPDATE SET absences=excluded.absences, trend=excluded.trend, updated_at=excluded.updated_at, updated_by=excluded.updated_by', acc.athlete.id, absences, trend, nowIso(), ctx.user.display_name);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Schule', action: 'Schulstatus aktualisiert' });
    return { ok: true };
  });
  router.post('/api/athletes/:id/exams', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'school', ['full'], 'Prüfung eintragen');
    const b = await ctx.json();
    const subject = str(b.subject, 100), date = str(b.date, 10);
    if (!subject) throw badRequest('Bitte das Fach bzw. die Prüfung angeben.');
    if (!isDate(date)) throw badRequest('Bitte ein gültiges Datum angeben.');
    db.run('INSERT INTO exams(athlete_id, date, subject, created_by, created_at) VALUES (?,?,?,?,?)', acc.athlete.id, date, subject, ctx.user.display_name, nowIso());
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Schule', action: 'Prüfung eingetragen', detail: `${date} ${subject}` });
    return { ok: true };
  });
  router.delete('/api/exams/:id', (ctx) => {
    const x = db.get('SELECT * FROM exams WHERE id = ?', Number(ctx.params.id));
    if (!x) throw notFound('Prüfung nicht gefunden.');
    const acc = accessFor(db, ctx, x.athlete_id);
    need(db, ctx, acc, 'school', ['full'], 'Prüfung löschen');
    db.run('DELETE FROM exams WHERE id = ?', x.id);
    audit(db, ctx, { athleteId: x.athlete_id, area: 'Schule', action: 'Prüfung gelöscht', detail: `${x.date} ${x.subject}` });
    return { ok: true };
  });

  // Dual Career: Überblick über alle Akten mit Schulzugriff
  router.get('/api/school/overview', (ctx) => {
    const vis = visibleWithLevels(db, ctx.user).filter((v) => v.levels.school === 'full' && v.athlete.status !== 'ausgetreten');
    if (!vis.length) throw forbidden();
    const rows = vis.map((v) => {
      const a = v.athlete, s = db.get('SELECT * FROM school WHERE athlete_id = ?', a.id);
      return { id: a.id, name: a.name, school: a.school, schoolClass: a.school_class, eduGoal: a.edu_goal, absences: s?.absences ?? 0, trend: s?.trend ?? '–', conflicts: examConflicts(db, a.id, a.sport) };
    });
    audit(db, ctx, { area: 'Schule', action: 'Schulübersicht geöffnet', result: 'vollständig', dedupe: true });
    return { athletes: rows };
  });
}
