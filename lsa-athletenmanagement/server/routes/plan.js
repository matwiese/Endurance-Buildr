// Entwicklungsplan (Ziele, Maßnahmen, Wirkungskontrolle) und Entscheidungsprotokoll
import { badRequest, notFound } from '../http.js';
import { audit } from '../auth.js';
import { accessFor, need } from '../access.js';
import { GOAL_AREAS } from '../catalog.js';
import { addDays, isDate, nowIso, str, todayStr } from '../util.js';
import { planDto } from './performance.js';

const decDto = (d) => ({ id: d.id, aid: d.athlete_id, date: d.date, reason: d.reason, info: d.info, decision: d.decision, resp: d.resp, affected: d.affected, measure: d.measure, review: d.review_date, result: d.result, createdBy: d.created_by });

export function addDecision(db, { athleteId, date = todayStr(), reason, info = '', decision, resp = '', affected = '', measure = '', review = '', result = '', by = '' }) {
  const now = nowIso();
  return db.run('INSERT INTO decisions(athlete_id, date, reason, info, decision, resp, affected, measure, review_date, result, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    athleteId, date, reason, info, decision, resp, affected, measure, review, result, by, now, now).lastInsertRowid;
}

export function register(app) {
  const { router, db } = app;

  // ------------------------------------------------------------- Plan
  router.get('/api/athletes/:id/plan', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const lvl = need(db, ctx, acc, 'plan', ['read', 'full', 'own'], 'Entwicklungsplan ansehen');
    return { ...planDto(db, acc.athlete.id), canEdit: lvl === 'full', goalAreas: GOAL_AREAS };
  });

  router.put('/api/athletes/:id/plan', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'plan', ['full'], 'Plan bearbeiten');
    const b = await ctx.json();
    const cur = db.get('SELECT * FROM plans WHERE athlete_id = ?', acc.athlete.id) || { baseline: '', long_term: '' };
    const baseline = b.baseline !== undefined ? str(b.baseline, 3000) : cur.baseline;
    const longTerm = b.longTerm !== undefined ? str(b.longTerm, 3000) : cur.long_term;
    db.run(`INSERT INTO plans(athlete_id, baseline, long_term, updated_at, updated_by) VALUES (?,?,?,?,?)
      ON CONFLICT(athlete_id) DO UPDATE SET baseline = excluded.baseline, long_term = excluded.long_term, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    acc.athlete.id, baseline, longTerm, nowIso(), ctx.user.display_name);
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Performance', action: 'Entwicklungsplan geändert (Ausgangslage/Ziel)', dedupe: true });
    return { ok: true };
  });

  router.post('/api/athletes/:id/goals', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'plan', ['full'], 'Ziel anlegen');
    const b = await ctx.json();
    const area = str(b.area, 40), text = str(b.text, 300);
    if (!GOAL_AREAS.includes(area)) throw badRequest('Bitte einen Bereich wählen.');
    if (!text) throw badRequest('Bitte das Ziel beschreiben.');
    if (db.get('SELECT COUNT(*) AS n FROM goals WHERE athlete_id = ? AND area = ?', acc.athlete.id, area).n >= 3) throw badRequest('Höchstens drei Ziele je Bereich – bitte priorisieren.');
    const id = db.run('INSERT INTO goals(athlete_id, area, text, created_by, created_at) VALUES (?,?,?,?,?)', acc.athlete.id, area, text, ctx.user.display_name, nowIso()).lastInsertRowid;
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Performance', action: 'Jahresziel angelegt', detail: `${area}: ${text}` });
    return { id };
  });

  const loadGoal = (ctx, id) => {
    const g = db.get('SELECT * FROM goals WHERE id = ?', Number(id));
    if (!g) throw notFound('Ziel nicht gefunden.');
    const acc = accessFor(db, ctx, g.athlete_id);
    need(db, ctx, acc, 'plan', ['full'], 'Ziel ändern');
    return { g, acc };
  };
  router.put('/api/goals/:id', async (ctx) => {
    const { g } = loadGoal(ctx, ctx.params.id);
    const b = await ctx.json();
    const text = str(b.text ?? g.text, 300), area = str(b.area ?? g.area, 40);
    if (!text || !GOAL_AREAS.includes(area)) throw badRequest('Ungültige Angaben.');
    if (area !== g.area && db.get('SELECT COUNT(*) AS n FROM goals WHERE athlete_id = ? AND area = ?', g.athlete_id, area).n >= 3) throw badRequest('Höchstens drei Ziele je Bereich – bitte priorisieren.');
    db.run('UPDATE goals SET text = ?, area = ? WHERE id = ?', text, area, g.id);
    audit(db, ctx, { athleteId: g.athlete_id, area: 'Performance', action: 'Jahresziel geändert', detail: text });
    return { ok: true };
  });
  router.delete('/api/goals/:id', (ctx) => {
    const { g } = loadGoal(ctx, ctx.params.id);
    const n = db.get('SELECT COUNT(*) AS n FROM measures WHERE goal_id = ?', g.id).n;
    db.run('DELETE FROM goals WHERE id = ?', g.id);
    audit(db, ctx, { athleteId: g.athlete_id, area: 'Performance', action: 'Jahresziel gelöscht', detail: `${g.text} (+ ${n} Maßnahme(n))` });
    return { ok: true };
  });

  // Maßnahmen: ohne Verantwortung, Prüftermin und Erfolgskriterium wird nicht gespeichert (Konzept Kap. 4)
  function readMeasure(b, cur) {
    const m = {
      text: str(b.text ?? cur?.text, 300), resp: str(b.resp ?? cur?.resp, 150), start: str(b.start ?? cur?.start_date ?? todayStr(), 10),
      review: str(b.review ?? cur?.review_date, 10), criterion: str(b.criterion ?? cur?.criterion, 300),
    };
    if (!m.text) throw badRequest('Bitte die Maßnahme beschreiben.');
    if (!m.resp) throw badRequest('Ohne verantwortliche Person wird nicht gespeichert.');
    if (!isDate(m.review)) throw badRequest('Ohne Überprüfungstermin wird nicht gespeichert.');
    if (!m.criterion) throw badRequest('Ohne Erfolgskriterium wird nicht gespeichert.');
    if (!isDate(m.start)) throw badRequest('Ungültiger Starttermin.');
    return m;
  }
  router.post('/api/athletes/:id/measures', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'plan', ['full'], 'Maßnahme anlegen');
    const b = await ctx.json();
    const g = db.get('SELECT * FROM goals WHERE id = ? AND athlete_id = ?', Number(b.goalId), acc.athlete.id);
    if (!g) throw badRequest('Bitte ein Ziel dieser Akte wählen.');
    const m = readMeasure(b);
    const now = nowIso();
    const id = db.run('INSERT INTO measures(athlete_id, goal_id, text, resp, start_date, review_date, criterion, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      acc.athlete.id, g.id, m.text, m.resp, m.start, m.review, m.criterion, 'offen', ctx.user.display_name, now, now).lastInsertRowid;
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Performance', action: 'Maßnahme angelegt', detail: m.text });
    return { id };
  });
  const loadMeasure = (ctx, id) => {
    const m = db.get('SELECT * FROM measures WHERE id = ?', Number(id));
    if (!m) throw notFound('Maßnahme nicht gefunden.');
    const acc = accessFor(db, ctx, m.athlete_id);
    need(db, ctx, acc, 'plan', ['full'], 'Maßnahme ändern');
    return { m, acc };
  };
  router.put('/api/measures/:id', async (ctx) => {
    const { m: cur } = loadMeasure(ctx, ctx.params.id);
    const b = await ctx.json();
    const m = readMeasure(b, cur);
    const status = ['offen', 'laufend', 'beendet'].includes(b.status) ? b.status : cur.status;
    db.run('UPDATE measures SET text = ?, resp = ?, start_date = ?, review_date = ?, criterion = ?, status = ?, updated_at = ? WHERE id = ?', m.text, m.resp, m.start, m.review, m.criterion, status, nowIso(), cur.id);
    audit(db, ctx, { athleteId: cur.athlete_id, area: 'Performance', action: 'Maßnahme geändert', detail: m.text });
    return { ok: true };
  });
  router.delete('/api/measures/:id', (ctx) => {
    const { m } = loadMeasure(ctx, ctx.params.id);
    db.run('DELETE FROM measures WHERE id = ?', m.id);
    audit(db, ctx, { athleteId: m.athlete_id, area: 'Performance', action: 'Maßnahme gelöscht', detail: m.text });
    return { ok: true };
  });
  // Wirkungskontrolle: Ergebnis + nächste Entscheidung; wird automatisch im Entscheidungsprotokoll festgehalten
  router.post('/api/measures/:id/review', async (ctx) => {
    const { m } = loadMeasure(ctx, ctx.params.id);
    const b = await ctx.json();
    const result = str(b.result, 500), next = str(b.next, 20);
    if (!result) throw badRequest('Bitte das Ergebnis eintragen: Zielgröße verändert? Umgesetzt?');
    if (!['fortführen', 'anpassen', 'beenden'].includes(next)) throw badRequest('Bitte fortführen, anpassen oder beenden wählen.');
    const status = next === 'beenden' ? 'beendet' : 'laufend';
    const review = next === 'beenden' ? m.review_date : addDays(todayStr(), 28);
    db.tx(() => {
      db.run('UPDATE measures SET result = ?, next = ?, status = ?, review_date = ?, updated_at = ? WHERE id = ?', result, next, status, review, nowIso(), m.id);
      addDecision(db, { athleteId: m.athlete_id, reason: `Wirkungskontrolle: ${m.text}`, info: `Erfolgskriterium: ${m.criterion}`, decision: `Maßnahme ${next}`, resp: ctx.user.display_name,
        affected: 'Athlet:in, Verantwortliche', measure: m.text, review: next === 'beenden' ? '' : review, result, by: ctx.user.display_name });
    });
    audit(db, ctx, { athleteId: m.athlete_id, area: 'Performance', action: `Wirkungskontrolle: Maßnahme ${next}`, detail: m.text });
    return { ok: true };
  });

  // ------------------------------------------------------------- Entscheidungen
  router.get('/api/athletes/:id/decisions', (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    const lvl = need(db, ctx, acc, 'decisions', ['read', 'full', 'own'], 'Entscheidungsprotokoll ansehen');
    return { decisions: db.all('SELECT * FROM decisions WHERE athlete_id = ? ORDER BY date DESC, id DESC', acc.athlete.id).map(decDto), canWrite: lvl === 'full' };
  });
  router.post('/api/athletes/:id/decisions', async (ctx) => {
    const acc = accessFor(db, ctx, ctx.params.id);
    need(db, ctx, acc, 'decisions', ['full'], 'Entscheidung protokollieren');
    const b = await ctx.json();
    const d = { reason: str(b.reason, 300), info: str(b.info, 300), decision: str(b.decision, 500), resp: str(b.resp, 150), affected: str(b.affected, 200), measure: str(b.measure, 300), review: str(b.review, 10), date: str(b.date, 10) || todayStr() };
    if (!d.reason || !d.info || !d.decision || !d.resp) throw badRequest('Anlass, verwendete Informationen, Entscheidung und verantwortliche Person sind Pflicht.');
    if (!isDate(d.review)) throw badRequest('Bitte einen Prüftermin angeben.');
    if (!isDate(d.date)) throw badRequest('Ungültiges Datum.');
    const id = addDecision(db, { athleteId: acc.athlete.id, ...d, by: ctx.user.display_name });
    audit(db, ctx, { athleteId: acc.athlete.id, area: 'Performance', action: 'Entscheidung protokolliert', detail: d.decision });
    return { id };
  });
  router.put('/api/decisions/:id', async (ctx) => {
    const d = db.get('SELECT * FROM decisions WHERE id = ?', Number(ctx.params.id));
    if (!d) throw notFound('Eintrag nicht gefunden.');
    const acc = accessFor(db, ctx, d.athlete_id);
    need(db, ctx, acc, 'decisions', ['full'], 'Entscheidung ergänzen');
    const b = await ctx.json();
    db.run('UPDATE decisions SET result = ?, updated_at = ? WHERE id = ?', str(b.result, 500), nowIso(), d.id);
    audit(db, ctx, { athleteId: d.athlete_id, area: 'Performance', action: 'Ergebnis einer Entscheidung ergänzt', detail: d.decision, dedupe: true });
    return { ok: true };
  });
}
