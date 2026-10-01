// Gemeinsamer Kalender (Wettkämpfe, Reisen, Tests) und Hinweise & Eskalation
import { badRequest, forbidden, notFound } from '../http.js';
import { audit } from '../auth.js';
import { getSetting } from '../db.js';
import { visibleAthletes } from '../access.js';
import { EVENT_TYPES, STAGES } from '../catalog.js';
import { alertDto, alertVisible } from '../alerts.js';
import { addDays, isDate, nowIso, str, todayStr } from '../util.js';

export function register(app) {
  const { router, db } = app;

  // Sportarten, die diese Person sehen/bearbeiten darf ('' = alle Sportarten nur bei Zugriff auf alle)
  function sportsFor(ctx) {
    const all = getSetting(db, 'sports', []);
    if (ctx.user.role === 'athlet') {
      const a = db.get('SELECT sport FROM athletes WHERE id = ?', ctx.user.athlete_id);
      return { sports: a ? [a.sport] : [], all: false };
    }
    if (ctx.scope.all) return { sports: all, all: true };
    return { sports: [...new Set(visibleAthletes(db, ctx.user).map((a) => a.sport))], all: false };
  }

  router.get('/api/events', (ctx) => {
    const from = isDate(ctx.query.from) ? ctx.query.from : addDays(todayStr(), -7);
    const to = isDate(ctx.query.to) ? ctx.query.to : addDays(todayStr(), 120);
    const { sports, all } = sportsFor(ctx);
    const rows = db.all('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, id', from, to)
      .filter((e) => !e.sport || sports.includes(e.sport) || (all && ctx.hasFeature('events.manage')));
    return { events: rows.map((e) => ({ id: e.id, date: e.date, title: e.title, type: e.type, sport: e.sport, note: e.note, createdBy: e.created_by })), canManage: ctx.hasFeature('events.manage'), sports, allSports: all, types: EVENT_TYPES };
  });

  function readEvent(ctx, b, cur) {
    const { sports, all } = sportsFor(ctx);
    const e = { date: str(b.date ?? cur?.date, 10), title: str(b.title ?? cur?.title, 150), type: str(b.type ?? cur?.type ?? 'Sonstiges', 20), sport: str(b.sport ?? cur?.sport ?? '', 60), note: str(b.note ?? cur?.note, 500) };
    if (!isDate(e.date)) throw badRequest('Bitte ein gültiges Datum angeben.');
    if (!e.title) throw badRequest('Bitte einen Titel angeben.');
    if (!EVENT_TYPES.includes(e.type)) throw badRequest('Unbekannte Art des Termins.');
    if (e.sport === '' && !all) throw forbidden('„Alle Sportarten“ dürfen nur Personen mit Zugriff auf alle Athlet:innen wählen.');
    if (e.sport !== '' && !sports.includes(e.sport)) throw forbidden('Für diese Sportart fehlt der Zugriff.');
    return e;
  }
  router.post('/api/events', { feature: 'events.manage' }, async (ctx) => {
    const e = readEvent(ctx, await ctx.json(), null);
    const id = db.run('INSERT INTO events(date, title, type, sport, note, created_by, created_at) VALUES (?,?,?,?,?,?,?)', e.date, e.title, e.type, e.sport, e.note, ctx.user.display_name, nowIso()).lastInsertRowid;
    audit(db, ctx, { area: 'Performance', action: 'Termin angelegt', detail: `${e.date} ${e.title}` });
    return { id };
  });
  router.put('/api/events/:id', { feature: 'events.manage' }, async (ctx) => {
    const cur = db.get('SELECT * FROM events WHERE id = ?', Number(ctx.params.id));
    if (!cur) throw notFound('Termin nicht gefunden.');
    const { sports, all } = sportsFor(ctx);
    if (cur.sport === '' ? !all : !sports.includes(cur.sport)) throw forbidden('Dieser Termin gehört zu einer Sportart ohne Ihren Zugriff.');
    const e = readEvent(ctx, await ctx.json(), cur);
    db.run('UPDATE events SET date = ?, title = ?, type = ?, sport = ?, note = ? WHERE id = ?', e.date, e.title, e.type, e.sport, e.note, cur.id);
    audit(db, ctx, { area: 'Performance', action: 'Termin geändert', detail: `${e.date} ${e.title}` });
    return { ok: true };
  });
  router.delete('/api/events/:id', { feature: 'events.manage' }, (ctx) => {
    const cur = db.get('SELECT * FROM events WHERE id = ?', Number(ctx.params.id));
    if (!cur) throw notFound('Termin nicht gefunden.');
    const { sports, all } = sportsFor(ctx);
    if (cur.sport === '' ? !all : !sports.includes(cur.sport)) throw forbidden('Dieser Termin gehört zu einer Sportart ohne Ihren Zugriff.');
    db.run('DELETE FROM events WHERE id = ?', cur.id);
    audit(db, ctx, { area: 'Performance', action: 'Termin gelöscht', detail: `${cur.date} ${cur.title}` });
    return { ok: true };
  });

  // ---------------------------------------------------------------- Hinweise & Eskalation
  const idSetFor = (ctx) => new Set(visibleAthletes(db, ctx.user).map((a) => a.id));

  router.get('/api/alerts/count', { feature: 'alerts.view' }, (ctx) => {
    const ids = idSetFor(ctx);
    return { open: db.all("SELECT * FROM alerts WHERE status != 'erledigt'").filter((a) => alertVisible(ctx.user, a, ids)).length };
  });

  router.get('/api/alerts', { feature: 'alerts.view' }, (ctx) => {
    const ids = idSetFor(ctx);
    const names = new Map(db.all('SELECT id, name FROM athletes').map((a) => [a.id, a.name]));
    const rows = db.all('SELECT * FROM alerts ORDER BY created DESC, id DESC LIMIT 500').filter((a) => alertVisible(ctx.user, a, ids));
    return { alerts: rows.map((a) => ({ ...alertDto(a), athleteName: names.get(a.athlete_id) || a.athlete_id })), canEdit: ctx.hasFeature('alerts.edit'), stages: STAGES };
  });

  router.put('/api/alerts/:id', { feature: 'alerts.edit' }, async (ctx) => {
    const a = db.get('SELECT * FROM alerts WHERE id = ?', Number(ctx.params.id));
    if (!a || !alertVisible(ctx.user, a, idSetFor(ctx))) throw notFound('Hinweis nicht gefunden.');
    const b = await ctx.json();
    const stage = Number(b.stage ?? a.stage), resp = str(b.resp ?? a.resp, 150), control = str(b.control ?? a.control, 10), note = str(b.note ?? a.note, 500);
    if (!(stage >= 1 && stage <= 5)) throw badRequest('Ungültige Eskalationsstufe.');
    if (!resp) throw badRequest('Jede Eskalation braucht eine verantwortliche Person.');
    if (!isDate(control)) throw badRequest('Jede Eskalation braucht einen Kontrolltermin.');
    let status;
    if (b.close) {
      if (!note) throw badRequest('Zum Abschließen bitte eine Notiz zum Ergebnis eintragen.');
      status = 'erledigt';
    } else status = stage === 5 ? 'Akutprozess' : 'in Prüfung';
    db.run('UPDATE alerts SET stage = ?, resp = ?, control = ?, note = ?, status = ?, updated_at = ?, updated_by = ? WHERE id = ?', stage, resp, control, note, status, nowIso(), ctx.user.display_name, a.id);
    if (b.close && a.rule === 'contact') db.run("UPDATE contact_requests SET status = 'bearbeitet' WHERE athlete_id = ? AND status = 'offen'", a.athlete_id);
    audit(db, ctx, { athleteId: a.athlete_id, area: 'Hinweise', action: `Hinweis ${b.close ? 'abgeschlossen' : `aktualisiert (Stufe ${stage})`}`, detail: a.trigger_text });
    return { ok: true, status };
  });
}
