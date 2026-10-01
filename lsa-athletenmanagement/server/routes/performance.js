// Performance: Daten-Schnappschuss (core), Tages-Check, Trainingserfassung, Messwerte
import { badRequest, forbidden, notFound } from '../http.js';
import { audit } from '../auth.js';
import { accessFor, need, visibleWithLevels, athleteDto } from '../access.js';
import { SESSION_STATUS, VARIABLES, READINESS_ITEMS } from '../catalog.js';
import { evaluateAthlete, alertVisible, alertDto } from '../alerts.js';
import { statusDto } from './medical.js';
import { hintDto } from './psych.js';
import { addDays, dayDiff, isDate, nowIso, str, todayStr, bool } from '../util.js';

const ph = (n) => Array(n).fill('?').join(',');
const WELLBEING = ['sleepQ', 'stress', 'fatigue'];

export const sessionDto = (t) => ({ id: t.id, aid: t.athlete_id, date: t.date, title: t.title, plannedMin: t.planned_min, status: t.status, duration: t.duration, rpe: t.rpe, reason: t.reason, decidedBy: t.decided_by });
export const readinessDto = (r, restricted = false) => {
  const full = { sleepQ: r.sleep_q, recovery: r.recovery, soreness: r.soreness, fatigue: r.fatigue, stress: r.stress, ready: r.ready, sleepH: r.sleep_h, pain: !!r.pain, symptoms: !!r.symptoms, comment: r.comment };
  if (!restricted) return full;
  return { sleepQ: full.sleepQ, stress: full.stress, fatigue: full.fatigue, sleepH: full.sleepH };
};
export const planDto = (db, aid) => {
  const p = db.get('SELECT * FROM plans WHERE athlete_id = ?', aid) || { baseline: '', long_term: '' };
  return {
    baseline: p.baseline, longTerm: p.long_term,
    goals: db.all('SELECT id, area, text FROM goals WHERE athlete_id = ? ORDER BY id', aid),
    measures: db.all('SELECT * FROM measures WHERE athlete_id = ? ORDER BY id', aid).map((m) => ({
      id: m.id, goal: m.goal_id, text: m.text, resp: m.resp, start: m.start_date, review: m.review_date, criterion: m.criterion, status: m.status, result: m.result, next: m.next })),
  };
};

export function register(app) {
  const { router, db } = app;

  // ------------------------------------------------------------------ core
  // Gefilterter Schnappschuss: nur Daten, für die die Person je Akte die nötige Stufe hat.
  router.get('/api/core', (ctx) => {
    const today = todayStr();
    let vis = visibleWithLevels(db, ctx.user);
    if (ctx.query.athlete) vis = vis.filter((v) => v.athlete.id === ctx.query.athlete);
    const ids = vis.map((v) => v.athlete.id);
    const lv = (id) => vis.find((v) => v.athlete.id === id).levels;
    const out = { today, athletes: [], readiness: {}, sessions: [], plans: {}, events: [], alerts: [], status: {}, exams: [], released: {} };

    const team = new Map();
    if (ids.length) {
      for (const r of db.all(`SELECT s.athlete_id, s.function, u.display_name FROM athlete_staff s JOIN users u ON u.id = s.user_id WHERE s.athlete_id IN (${ph(ids.length)})`, ...ids)) {
        if (!team.has(r.athlete_id)) team.set(r.athlete_id, []);
        team.get(r.athlete_id).push({ function: r.function, name: r.display_name });
      }
    }
    out.athletes = vis.filter((v) => v.levels.overview !== 'none').map((v) => ({ ...athleteDto(v.athlete), levels: v.levels, team: team.get(v.athlete.id) || [] }));

    const monIds = ids.filter((id) => ['read', 'full', 'own', 'wellbeing'].includes(lv(id).monitoring));
    if (monIds.length) {
      for (const r of db.all(`SELECT * FROM readiness WHERE athlete_id IN (${ph(monIds.length)}) AND date BETWEEN ? AND ? ORDER BY date`, ...monIds, addDays(today, -13), today)) {
        (out.readiness[r.athlete_id] ||= {})[r.date] = readinessDto(r, lv(r.athlete_id).monitoring === 'wellbeing');
      }
      const sIds = monIds.filter((id) => lv(id).monitoring !== 'wellbeing');
      if (sIds.length) out.sessions = db.all(`SELECT * FROM training WHERE athlete_id IN (${ph(sIds.length)}) AND date BETWEEN ? AND ? ORDER BY date, id`, ...sIds, addDays(today, -13), addDays(today, 14)).map(sessionDto);
    }
    for (const id of ids.filter((i) => lv(i).plan !== 'none')) out.plans[id] = planDto(db, id);

    // Belastungsstatus (Ampel), Prüfungen und freigegebene Hinweise – jeweils nur bei passender Stufe
    const stIds = ids.filter((id) => ['status', 'physio', 'full', 'own'].includes(lv(id).health));
    if (stIds.length) {
      const rows = new Map(db.all(`SELECT * FROM load_status WHERE athlete_id IN (${ph(stIds.length)})`, ...stIds).map((r) => [r.athlete_id, r]));
      for (const id of stIds) out.status[id] = statusDto(rows.get(id));
    }
    const exIds = ids.filter((id) => ['planning', 'full', 'own'].includes(lv(id).school));
    if (exIds.length) out.exams = db.all(`SELECT athlete_id, date, subject FROM exams WHERE athlete_id IN (${ph(exIds.length)}) AND date BETWEEN ? AND ? ORDER BY date`, ...exIds, addDays(today, -1), addDays(today, 45)).map((x) => ({ aid: x.athlete_id, date: x.date, subject: x.subject }));
    const hIds = ids.filter((id) => ['released', 'own', 'full'].includes(lv(id).psych));
    if (hIds.length) for (const h of db.all(`SELECT * FROM released_hints WHERE athlete_id IN (${ph(hIds.length)}) ORDER BY date DESC, id DESC`, ...hIds)) (out.released[h.athlete_id] ||= []).push(hintDto(h));

    // Termine: für die Sportarten der sichtbaren Akten (oder alle, wenn die Person alle Athlet:innen betreut)
    const sports = new Set(vis.map((v) => v.athlete.sport));
    const evs = db.all('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, id', addDays(today, -1), addDays(today, 45));
    out.events = evs.filter((e) => !e.sport || sports.has(e.sport) || (ctx.scope.all && ctx.hasFeature('events.manage'))).map((e) => ({ id: e.id, date: e.date, title: e.title, type: e.type, sport: e.sport, note: e.note }));

    if (ctx.hasFeature('alerts.view')) {
      const idSet = new Set(ids);
      out.alerts = db.all("SELECT * FROM alerts WHERE status != 'erledigt' ORDER BY created DESC, id DESC").filter((a) => alertVisible(ctx.user, a, idSet)).map(alertDto);
    }
    return out;
  });

  // ------------------------------------------------------------------ Tages-Check (Athlet:in)
  function ownAthlete(ctx) {
    if (!ctx.hasFeature('checkin.self') || ctx.user.role !== 'athlet' || !ctx.user.athlete_id) throw forbidden('Der Tages-Check ist nur für Athlet:innen mit eigener Akte.');
    return ctx.user.athlete_id;
  }
  const pendingRpe = (aid, today) => db.all(
    "SELECT * FROM training WHERE athlete_id = ? AND date BETWEEN ? AND ? AND rpe IS NULL AND status IN ('geplant','vollständig','angepasst','abgebrochen') AND date <= ? ORDER BY date DESC, id",
    aid, addDays(today, -3), today, today).map(sessionDto);

  router.get('/api/checkin', (ctx) => {
    const aid = ownAthlete(ctx), today = todayStr();
    const r = db.get('SELECT * FROM readiness WHERE athlete_id = ? AND date = ?', aid, today);
    return { today, entry: r ? readinessDto(r) : null, pendingRpe: pendingRpe(aid, today), items: READINESS_ITEMS };
  });

  router.post('/api/checkin', async (ctx) => {
    const aid = ownAthlete(ctx), today = todayStr();
    const b = await ctx.json();
    const e = {};
    for (const [k] of READINESS_ITEMS) {
      const v = Number(b[k]);
      if (!Number.isInteger(v) || v < 1 || v > 5) throw badRequest('Bitte alle sechs Fragen mit 1 bis 5 beantworten.');
      e[k] = v;
    }
    const sleepH = b.sleepH === '' || b.sleepH == null ? null : Number(b.sleepH);
    if (sleepH != null && (!(sleepH >= 0) || sleepH > 16)) throw badRequest('Schlafdauer: 0 bis 16 Stunden.');
    const now = nowIso();
    db.run(`INSERT INTO readiness(athlete_id, date, sleep_q, recovery, soreness, fatigue, stress, ready, sleep_h, pain, symptoms, comment, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(athlete_id, date) DO UPDATE SET sleep_q=excluded.sleep_q, recovery=excluded.recovery, soreness=excluded.soreness, fatigue=excluded.fatigue, stress=excluded.stress,
        ready=excluded.ready, sleep_h=excluded.sleep_h, pain=excluded.pain, symptoms=excluded.symptoms, comment=excluded.comment, updated_at=excluded.updated_at`,
    aid, today, e.sleepQ, e.recovery, e.soreness, e.fatigue, e.stress, e.ready, sleepH, bool(b.pain) ? 1 : 0, bool(b.symptoms) ? 1 : 0, str(b.comment, 300), now, now);
    if (bool(b.contact) && !db.get("SELECT 1 AS x FROM contact_requests WHERE athlete_id = ? AND status = 'offen'", aid)) {
      db.run('INSERT INTO contact_requests(athlete_id, date, created_at) VALUES (?,?,?)', aid, today, now);
    }
    const created = evaluateAthlete(db, aid, today);
    audit(db, ctx, { athleteId: aid, area: 'Performance', action: 'Tages-Check gespeichert' });
    return { ok: true, alertsCreated: created.length };
  });

  router.put('/api/training/:id/rpe', async (ctx) => {
    const aid = ownAthlete(ctx), today = todayStr();
    const t = db.get('SELECT * FROM training WHERE id = ?', Number(ctx.params.id));
    if (!t || t.athlete_id !== aid) throw notFound('Einheit nicht gefunden.');
    if (t.date > today || dayDiff(t.date, today) < -7) throw badRequest('Die Anstrengung kann nur für heutige und die letzten 7 Tage angegeben werden.');
    const rpe = Number((await ctx.json()).rpe);
    if (!(rpe >= 0 && rpe <= 10)) throw badRequest('Session-RPE: 0 bis 10.');
    db.run('UPDATE training SET rpe = ?, updated_at = ?, updated_by = ? WHERE id = ?', rpe, nowIso(), ctx.user.display_name, t.id);
    evaluateAthlete(db, aid, today);
    audit(db, ctx, { athleteId: aid, area: 'Performance', action: 'Session-RPE eingetragen', dedupe: true });
    return { ok: true };
  });

  // ------------------------------------------------------------------ Trainingserfassung (Trainer:in)
  const trainable = (ctx) => visibleWithLevels(db, ctx.user).filter((v) => v.levels.monitoring === 'full' && v.athlete.status !== 'ausgetreten');

  router.get('/api/training', { feature: 'training.record' }, (ctx) => {
    const date = isDate(ctx.query.date) ? ctx.query.date : todayStr();
    const vis = trainable(ctx);
    const ids = vis.map((v) => v.athlete.id);
    const rows = ids.length ? db.all(`SELECT * FROM training WHERE date = ? AND athlete_id IN (${ph(ids.length)}) ORDER BY id`, date, ...ids).map(sessionDto) : [];
    return {
      date, statuses: SESSION_STATUS,
      athletes: vis.map((v) => ({ id: v.athlete.id, name: v.athlete.name, discipline: v.athlete.discipline, sport: v.athlete.sport, group: v.athlete.group_name, sessions: rows.filter((s) => s.aid === v.athlete.id) })),
    };
  });

  router.post('/api/training/plan', { feature: 'training.record' }, async (ctx) => {
    const b = await ctx.json();
    if (!isDate(b.date)) throw badRequest('Bitte ein gültiges Datum angeben.');
    if (Math.abs(dayDiff(b.date)) > 400) throw badRequest('Datum unplausibel.');
    const title = str(b.title, 100) || 'Training';
    const plannedMin = b.plannedMin === '' || b.plannedMin == null ? null : Number(b.plannedMin);
    if (plannedMin != null && !(Number.isInteger(plannedMin) && plannedMin >= 0 && plannedMin <= 300)) throw badRequest('Geplante Dauer: 0 bis 300 Minuten.');
    const allowed = new Map(trainable(ctx).map((v) => [v.athlete.id, v.athlete]));
    const ids = [...new Set(Array.isArray(b.athleteIds) ? b.athleteIds.map(String) : [])];
    if (!ids.length) throw badRequest('Bitte mindestens eine Athlet:in auswählen.');
    let made = 0, skipped = 0;
    db.tx(() => {
      for (const id of ids) {
        if (!allowed.has(id)) throw forbidden('Für eine der gewählten Akten fehlt die Berechtigung zur Trainingserfassung.');
        if (db.get('SELECT 1 AS x FROM training WHERE athlete_id = ? AND date = ? AND title = ?', id, b.date, title)) { skipped++; continue; }
        const now = nowIso();
        db.run('INSERT INTO training(athlete_id, date, title, planned_min, status, created_by, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?)', id, b.date, title, plannedMin, 'geplant', ctx.user.display_name, now, now, ctx.user.display_name);
        made++;
      }
    });
    audit(db, ctx, { area: 'Performance', action: `Einheit „${title}“ am ${b.date} geplant`, detail: `${made} Athlet:in(nen)` });
    return { created: made, skipped };
  });

  router.post('/api/training/day', { feature: 'training.record' }, async (ctx) => {
    const b = await ctx.json();
    if (!isDate(b.date) || !Array.isArray(b.rows)) throw badRequest('Ungültige Angaben.');
    const allowed = new Set(trainable(ctx).map((v) => v.athlete.id));
    let noReason = 0;
    const touched = new Set();
    db.tx(() => {
      for (const r of b.rows) {
        const t = db.get('SELECT t.*, a.name FROM training t JOIN athletes a ON a.id = t.athlete_id WHERE t.id = ?', Number(r.id));
        if (!t || t.date !== b.date) throw badRequest('Eine Einheit passt nicht zum gewählten Tag.');
        if (!allowed.has(t.athlete_id)) throw forbidden(`Für ${t.name} fehlt die Berechtigung zur Trainingserfassung.`);
        const status = str(r.status, 30);
        if (!SESSION_STATUS.includes(status)) throw badRequest(`Ungültiger Status bei ${t.name}.`);
        const duration = r.duration === '' || r.duration == null ? null : Number(r.duration);
        if (duration != null && !(Number.isInteger(duration) && duration >= 0 && duration <= 300)) throw badRequest(`${t.name}: Dauer 0 bis 300 Minuten.`);
        const rpe = r.rpe === '' || r.rpe == null ? null : Number(r.rpe);
        if (rpe != null && !(rpe >= 0 && rpe <= 10)) throw badRequest(`${t.name}: Session-RPE 0 bis 10.`);
        const reason = str(r.reason, 300);
        if (!['vollständig', 'geplant'].includes(status) && !reason) noReason++;
        db.run('UPDATE training SET status = ?, duration = ?, rpe = ?, reason = ?, decided_by = ?, updated_at = ?, updated_by = ? WHERE id = ?',
          status, duration, rpe, reason, ['vollständig', 'geplant'].includes(status) ? '' : ctx.user.display_name, nowIso(), ctx.user.display_name, t.id);
        touched.add(t.athlete_id);
      }
    });
    let created = 0;
    for (const id of touched) created += evaluateAthlete(db, id).length;
    audit(db, ctx, { area: 'Performance', action: `Trainingseinheiten ${b.date} erfasst`, detail: `${b.rows.length} Einträge` });
    return { ok: true, missingReason: noReason, alertsCreated: created };
  });

  router.delete('/api/training/:id', { feature: 'training.record' }, (ctx) => {
    const t = db.get('SELECT * FROM training WHERE id = ?', Number(ctx.params.id));
    if (!t) throw notFound('Einheit nicht gefunden.');
    const acc = accessFor(db, ctx, t.athlete_id);
    need(db, ctx, acc, 'monitoring', ['full'], 'Einheit löschen');
    if (t.status !== 'geplant' || t.rpe != null || t.duration != null) throw badRequest('Nur noch nicht erfasste, geplante Einheiten lassen sich löschen.');
    db.run('DELETE FROM training WHERE id = ?', t.id);
    audit(db, ctx, { athleteId: t.athlete_id, area: 'Performance', action: 'Geplante Einheit gelöscht', detail: `${t.date} ${t.title}` });
    return { ok: true };
  });

  // ------------------------------------------------------------------ Messwerte
  const measDto = (m) => ({ id: m.id, date: m.date, variable: m.variable, value: m.value, rawValue: m.raw_value, unit: m.unit, source: m.source, note: m.note, status: m.status, createdBy: m.created_by });

  router.get('/api/athletes/:id/measurements', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'monitoring', ['read', 'full', 'own'], 'Messwerte ansehen');
    const rows = db.all('SELECT * FROM measurements WHERE athlete_id = ? ORDER BY date DESC, id DESC LIMIT 300', acc.athlete.id).map(measDto);
    return { measurements: rows, canWrite: acc.levels.monitoring === 'full', variables: VARIABLES };
  });

  router.post('/api/athletes/:id/measurements', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'monitoring', ['full'], 'Messwert erfassen');
    const b = await ctx.json();
    const date = str(b.date, 10) || todayStr();
    if (!isDate(date)) throw badRequest('Ungültiges Datum.');
    const variable = str(b.variable, 60);
    if (!variable) throw badRequest('Bitte eine Messgröße wählen oder benennen.');
    const value = Number(String(b.value).replace(',', '.'));
    if (!Number.isFinite(value)) throw badRequest('Bitte einen Zahlenwert eingeben.');
    const dict = VARIABLES.find((v) => v.key === variable);
    const unit = str(b.unit, 20) || dict?.unit || '';
    if (!dict && !unit) throw badRequest('Bei einer eigenen Messgröße bitte die Einheit angeben.');
    const source = str(b.source, 60) || dict?.source || 'manuelle Eingabe';
    const flags = [];
    if (dict && (value < dict.min || value > dict.max)) flags.push(`Unmöglicher Wert (Plausibilitätsgrenze ${dict.min}–${dict.max} ${dict.unit})`);
    if (date > todayStr()) flags.push('Zeitstempel in der Zukunft');
    if (db.get('SELECT 1 AS x FROM measurements WHERE athlete_id = ? AND variable = ? AND date = ?', acc.athlete.id, variable, date)) flags.push('Duplikat (gleicher Tag, gleiche Messgröße)');
    const prev = db.get('SELECT value FROM measurements WHERE athlete_id = ? AND variable = ? AND date < ? AND status != ? ORDER BY date DESC, id DESC LIMIT 1', acc.athlete.id, variable, date, 'markiert');
    if (prev && prev.value !== 0 && Math.abs(value - prev.value) / Math.abs(prev.value) > 0.1) flags.push(`Ungewöhnlicher Sprung > 10 % (Vorwert ${prev.value} ${unit})`);
    const now = nowIso();
    const id = db.tx(() => {
      const id = db.run('INSERT INTO measurements(athlete_id, date, variable, value, raw_value, unit, source, note, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        acc.athlete.id, date, variable, value, value, unit, source, str(b.note, 300), flags.length ? 'markiert' : 'ok', ctx.user.display_name, now).lastInsertRowid;
      for (const rule of flags) db.run('INSERT INTO quality_flags(athlete_id, variable, value, rule, source, ts, ref_type, ref_id) VALUES (?,?,?,?,?,?,?,?)', acc.athlete.id, variable, `${value} ${unit}`, rule, source, todayStr(), 'measurement', id);
      return id;
    });
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Performance', action: `Messwert erfasst: ${variable}`, detail: flags.length ? 'markiert: ' + flags.join('; ') : '' });
    return { id, flags };
  });

  router.delete('/api/measurements/:id', (ctx) => {
    const m = db.get('SELECT * FROM measurements WHERE id = ?', Number(ctx.params.id));
    if (!m) throw notFound('Messwert nicht gefunden.');
    const acc = accessFor(db, ctx, m.athlete_id);
    need(db, ctx, acc, 'monitoring', ['full'], 'Messwert löschen');
    db.tx(() => { db.run("DELETE FROM quality_flags WHERE ref_type = 'measurement' AND ref_id = ?", m.id); db.run('DELETE FROM measurements WHERE id = ?', m.id); });
    audit(db, ctx, { athleteId: m.athlete_id, area: 'Performance', action: `Messwert gelöscht: ${m.variable}`, detail: `${m.value} ${m.unit} am ${m.date}` });
    return { ok: true };
  });
}
